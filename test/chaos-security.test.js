import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ApprovalLedger, PolicyEngine } from '../packages/policy/src/index.ts';
import { SqliteApprovalStore, SqliteMigrationRunner, SqliteRuntimePersistence } from '../packages/adapter-sqlite/src/index.ts';
import { CapabilityRegistry } from '../packages/core/src/index.ts';

test('chaos/security: approval expirada não pode ser decidida nem reutilizada', () => {
  const database = new Database(':memory:');
  new SqliteMigrationRunner(database).apply();
  const ledger = new ApprovalLedger(new SqliteApprovalStore(database));
  const request = ledger.create({ action: 'code.write', justification: 'test', impact: 'fixture', expectedDiff: 'tests/a.js', expiresAt: '2026-08-02T00:01:00.000Z', correlationId: 'chaos' }, '2026-08-02T00:00:00.000Z');
  assert.deepEqual(ledger.expire('2026-08-02T00:02:00.000Z').map((value) => value.id), [request.id]);
  assert.throws(() => ledger.decide(request.id, { decision: 'approved', approverId: 'late-approver', decidedAt: '2026-08-02T00:03:00.000Z' }), /already decided|expired/);
  database.close();
});

test('chaos/security: checkpoint ou run corrompido falha de forma explícita', () => {
  const database = new Database(':memory:');
  new SqliteMigrationRunner(database).apply();
  database.prepare('INSERT INTO runtime_runs (run_id, payload, updated_at) VALUES (?, ?, ?)').run('corrupt-run', '{invalid-json', '2026-08-02T00:00:00.000Z');
  assert.throws(() => new SqliteRuntimePersistence(database).getRun('corrupt-run'), SyntaxError);
  database.close();
});

test('chaos/security: capability sem regra correspondente permanece deny-by-default', async () => {
  const registry = new CapabilityRegistry();
  registry.register({ definition: { schemaVersion: '2.0', createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z', correlationId: 'chaos', id: 'security.write', version: '1.0.0', description: 'write probe', permissions: ['write'], risk: 'high', sideEffects: ['write'], requirements: [], supportsAutonomy: false, idempotent: false, timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [] }, validateInput: (input) => input ?? {}, validateOutput: (output) => output, handler: async () => ({ capabilityId: 'security.write', payload: {}, evidence: [] }) });
  const policy = new PolicyEngine();
  const result = await registry.execute({ input: { capabilityId: 'security.write', payload: {} }, agent: { id: 'chaos-agent', name: 'chaos', role: 'developer', autonomy: 'supervised' }, policy, environment: 'local', categories: ['write'], files: [] });
  assert.equal(result.status, 'blocked');
  assert.equal(result.error.code, 'POLICY_DENIED');
});
