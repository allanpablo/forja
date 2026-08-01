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
