import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistry } from '../packages/core/src/index.ts';
import { PolicyEngine } from '../packages/policy/src/index.ts';

const now = '2026-07-31T00:00:00.000Z';
const definition = {
  schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'integration', id: 'workspace.read', version: '1.0.0',
  description: 'Read workspace', permissions: ['read'], risk: 'low', sideEffects: [], requirements: [], supportsAutonomy: true,
  idempotent: true, timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [],
};
const agent = { id: 'agent-1', name: 'developer', role: 'developer', autonomy: 'supervised', permissions: ['read'] };

test('registry + policy: contexto de execução chega ao Policy Engine', async () => {
  const registry = new CapabilityRegistry();
  registry.register({
    definition,
    validateInput: (input) => input,
    validateOutput: (output) => output,
    handler: (input) => ({ capabilityId: definition.id, payload: input, evidence: [] }),
  });
  const policy = new PolicyEngine({ rules: [{ id: 'read-local', priority: 10, effect: 'ALLOW', reason: 'read-only local access', scope: { roles: ['developer'], environments: ['local'], categories: ['read'], pathPrefixes: ['src/'] } }] });
  const result = await registry.execute({ input: { capabilityId: definition.id, payload: 'src/a.ts' }, agent, policy, environment: 'local', categories: ['read'], files: ['src/a.ts'] });
  assert.equal(result.status, 'succeeded');
});

test('registry + policy: ALLOW_WITH_LIMITS.maxFiles é aplicado, não só devolvido na decisão', async () => {
  const registry = new CapabilityRegistry();
  let handlerCalls = 0;
  registry.register({
    definition,
    validateInput: (input) => input,
    validateOutput: (output) => output,
    handler: (input) => { handlerCalls += 1; return { capabilityId: definition.id, payload: input, evidence: [] }; },
  });
  const policy = new PolicyEngine({ rules: [{ id: 'bounded-read', priority: 10, effect: 'ALLOW_WITH_LIMITS', reason: 'bounded read', scope: { roles: ['developer'] }, limits: { maxFiles: 1 } }] });
  const withinLimit = await registry.execute({ input: { capabilityId: definition.id, payload: 'x' }, agent, policy, environment: 'local', categories: ['read'], files: ['src/a.ts'] });
  assert.equal(withinLimit.status, 'succeeded');
  const overLimit = await registry.execute({ input: { capabilityId: definition.id, payload: 'x' }, agent, policy, environment: 'local', categories: ['read'], files: ['src/a.ts', 'src/b.ts'] });
  assert.equal(overLimit.status, 'failed');
  assert.equal(overLimit.error?.code, 'POLICY_LIMIT_EXCEEDED');
  assert.equal(handlerCalls, 1);
});

// SPEC-029 (cost-aware autonomy budget), AC-2: maxCostUsd segue exatamente o mesmo padrão de
// maxFiles acima — decisão carrega o limite, checkLimits aplica de fato antes do handler rodar.
test('registry + policy: ALLOW_WITH_LIMITS.maxCostUsd é aplicado quando o chamador estima o custo, não só devolvido na decisão', async () => {
  const registry = new CapabilityRegistry();
  let handlerCalls = 0;
  registry.register({
    definition,
    validateInput: (input) => input,
    validateOutput: (output) => output,
    handler: (input) => { handlerCalls += 1; return { capabilityId: definition.id, payload: input, evidence: [] }; },
  });
  const policy = new PolicyEngine({ rules: [{ id: 'bounded-cost', priority: 10, effect: 'ALLOW_WITH_LIMITS', reason: 'bounded cost', scope: { roles: ['developer'] }, limits: { maxCostUsd: 2 } }] });
  const withinLimit = await registry.execute({ input: { capabilityId: definition.id, payload: 'x' }, agent, policy, environment: 'local', categories: ['read'], files: ['src/a.ts'], estimatedCostUsd: 1.5 });
  assert.equal(withinLimit.status, 'succeeded');
  const overLimit = await registry.execute({ input: { capabilityId: definition.id, payload: 'x' }, agent, policy, environment: 'local', categories: ['read'], files: ['src/a.ts'], estimatedCostUsd: 2.5 });
  assert.equal(overLimit.status, 'failed');
  assert.equal(overLimit.error?.code, 'POLICY_LIMIT_EXCEEDED');
  assert.match(overLimit.error?.message ?? '', /maxCostUsd/);
  assert.equal(handlerCalls, 1);
});

// AC-4: preço/custo desconhecido é fail-open especificamente para maxCostUsd — nunca vira DENY.
test('registry + policy: maxCostUsd não bloqueia quando o chamador não sabe o custo (estimatedCostUsd ausente)', async () => {
  const registry = new CapabilityRegistry();
  registry.register({
    definition,
    validateInput: (input) => input,
    validateOutput: (output) => output,
    handler: (input) => ({ capabilityId: definition.id, payload: input, evidence: [] }),
  });
  const policy = new PolicyEngine({ rules: [{ id: 'bounded-cost', priority: 10, effect: 'ALLOW_WITH_LIMITS', reason: 'bounded cost', scope: { roles: ['developer'] }, limits: { maxCostUsd: 0.01 } }] });
  const result = await registry.execute({ input: { capabilityId: definition.id, payload: 'x' }, agent, policy, environment: 'local', categories: ['read'], files: ['src/a.ts'] });
  assert.equal(result.status, 'succeeded');
});
