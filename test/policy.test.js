import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalLedger, PolicyEngine, PolicyError } from '../packages/policy/src/index.ts';

const now = '2026-07-31T00:00:00.000Z';
const agent = { id: 'agent-1', name: 'developer', role: 'developer', autonomy: 'supervised' };
const definition = {
  schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'test', id: 'workspace.write', version: '1.0.0',
  description: 'Write workspace', permissions: ['write'], risk: 'high', sideEffects: ['filesystem'], requirements: [],
  supportsAutonomy: false, idempotent: false, timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [],
};

function request(overrides = {}) {
  return { definition, agent, projectId: 'forja', environment: 'local', categories: ['write'], files: ['src/a.ts'], now, ...overrides };
}

test('policy: default deny quando nenhuma regra casa', () => {
  const result = new PolicyEngine().authorize(request());
  assert.equal(result.effect, 'DENY');
  assert.equal(result.policyId, 'default-deny');
});

test('policy: regra allow with limits retorna limites estruturados', () => {
  const result = new PolicyEngine({ rules: [{ id: 'developer-write', priority: 10, effect: 'ALLOW_WITH_LIMITS', reason: 'bounded', scope: { roles: ['developer'] }, limits: { maxFiles: 2, maxTokens: 500 } }] }).authorize(request());
  assert.equal(result.effect, 'ALLOW_WITH_LIMITS');
  assert.deepEqual(result.limits, { maxFiles: 2, maxTokens: 500 });
});

test('policy: risco crítico exige aprovação mesmo com allow', () => {
  const critical = { ...definition, id: 'deployment.release', risk: 'critical' };
  const result = new PolicyEngine({ rules: [{ id: 'release', priority: 10, effect: 'ALLOW', reason: 'release window', scope: {} }] }).authorize(request({ definition: critical, categories: ['deployment'] }));
  assert.equal(result.effect, 'REQUIRE_APPROVAL');
  assert.equal(result.approvalRequestId, undefined);
});

test('policy: aprovação cria request auditável e ledger decide', () => {
  const ledger = new ApprovalLedger();
  const engine = new PolicyEngine({ approvalLedger: ledger, rules: [{ id: 'write-approval', priority: 1, effect: 'REQUIRE_APPROVAL', reason: 'review', scope: {} }] });
  const result = engine.authorize(request({ approval: { action: 'write', justification: 'task', impact: 'source change', expectedDiff: 'src/a.ts', expiresAt: '2026-08-01T00:00:00.000Z' } }));
  assert.equal(result.effect, 'REQUIRE_APPROVAL');
  const created = ledger.get(result.approvalRequestId);
  assert.equal(created.decision, undefined);
  const decided = ledger.decide(created.id, { decision: 'approved', approverId: 'reviewer-1', decidedAt: '2026-07-31T01:00:00.000Z' });
  assert.equal(decided.decision, 'approved');
});

test('policy: rejeita regra duplicada e empate prioriza deny', () => {
  assert.throws(() => new PolicyEngine({ rules: [{ id: 'same', priority: 1, effect: 'ALLOW', reason: 'a', scope: {} }, { id: 'same', priority: 1, effect: 'DENY', reason: 'b', scope: {} }] }), PolicyError);
  const result = new PolicyEngine({ rules: [{ id: 'allow', priority: 1, effect: 'ALLOW', reason: 'a', scope: {} }, { id: 'deny', priority: 1, effect: 'DENY', reason: 'b', scope: {} }] }).authorize(request());
  assert.equal(result.effect, 'DENY');
});
