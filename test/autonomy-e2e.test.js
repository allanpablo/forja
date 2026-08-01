import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { CapabilityRegistry } from '../packages/core/src/index.ts';
import { SqliteEventStore, SqliteMigrationRunner } from '../packages/adapter-sqlite/src/index.ts';
import { EventBus } from '../packages/events/src/index.ts';
import { ApprovalLedger } from '../packages/policy/src/index.ts';
import { InMemorySandboxStore, SandboxEngine } from '../packages/sandbox/src/index.ts';
import { RuntimeEngine } from '../packages/runtime/src/index.ts';
import { DeterministicValidator } from '../packages/validator/src/index.ts';

const now = '2026-08-01T00:00:00.000Z';
const agent = { id: 'agent-demo', name: 'Demo agent', role: 'developer', autonomy: 'supervised' };
const budget = { inputTokens: 100, outputTokens: 100, totalTokens: 200, usedTokens: 0 };

test('e2e: approval → sandbox → runtime → validator → evento persistido', async () => {
  let approved = false;
  let source = 'assert.equal(add(1, 1), 3)';
  const approvals = new ApprovalLedger();
  const policy = { authorize: () => approved ? ({ effect: 'ALLOW', reason: 'approval granted', policyId: 'demo-approved' }) : ({ effect: 'REQUIRE_APPROVAL', reason: 'code change requires approval', policyId: 'demo-approval' }) };
  const sandbox = new SandboxEngine(new InMemorySandboxStore(), {
    create: () => undefined,
    prepare: () => undefined,
    execute: () => { source = 'assert.equal(add(1, 1), 2)'; return { exitCode: 0, stdout: '1 passing', stderr: '', durationMs: 1, evidenceIds: ['e-test'] }; },
    validate: () => ({ status: 'accepted', evidenceIds: ['e-test'], summary: 'fixture test passes' }),
    diff: () => ({ files: ['tests/failing.test.js'], additions: 1, deletions: 1, evidenceIds: ['e-diff'] }),
    promote: () => undefined,
    reject: () => undefined,
    destroy: () => undefined,
  });
  const session = await sandbox.create({ runId: 'run-demo', root: '/tmp/forja-demo-sandbox' });
  await sandbox.prepare(session.id);

  const registry = new CapabilityRegistry();
  registry.register({
    definition: { schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'demo', id: 'fixture.fix-test', version: '1.0.0', description: 'Fix failing fixture test', permissions: ['write'], risk: 'low', sideEffects: ['sandbox_write'], requirements: [], supportsAutonomy: false, idempotent: true, timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [] },
    validateInput: (input) => input,
    validateOutput: (output) => output,
    handler: async () => { const execution = await sandbox.execute(session.id, { executable: 'fixture-test', args: [], cwd: '/tmp/forja-demo-sandbox' }); await sandbox.validate(session.id); return { capabilityId: 'fixture.fix-test', payload: { source, execution }, evidence: execution.evidenceIds.map((id) => ({ id, source: 'sandbox', locator: 'tests/failing.test.js', capturedAt: now, status: 'verified' })) }; },
  });
  const plan = { schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'demo-plan', id: 'plan-demo', objective: 'fix failing fixture test', budget, risk: 'low', evidenceIds: [], steps: [{ schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'demo-step', id: 'step-demo', objective: 'fix test', acceptanceCriteria: ['fixture test passes'], allowedFiles: ['tests/failing.test.js'], dependencyIds: [], evidenceIds: [], risk: 'low', budget, status: 'planned' }] };
  const validator = new DeterministicValidator();
  const runtime = new RuntimeEngine({
    registry,
    planner: { plan: () => [{ capabilityId: 'fixture.fix-test', payload: {}, estimatedTokens: 10, files: ['tests/failing.test.js'] }] },
    validator: { validate: (run, results) => validator.validate({ plan, changedFiles: run.changedFiles, checks: ['build', 'tests', 'lint', 'typecheck'].map((name) => ({ name, passed: true, evidenceIds: results.flatMap((result) => result.evidence.map((evidence) => evidence.id)) })), acceptance: [{ criterion: 'fixture test passes', passed: source.includes(', 2)'), evidenceIds: ['e-test'] }] }) },
  });

  const started = await runtime.start({ objective: 'fix failing fixture test', agent, budget, policy });
  const blocked = await runtime.execute(started.runId);
  assert.equal(blocked.state, 'awaiting_approval');
  const approval = approvals.create({ action: 'fixture.fix_test', justification: 'Fix deterministic failing test', impact: 'Only fixture test file', expectedDiff: 'tests/failing.test.js', expiresAt: '2099-01-01T00:00:00.000Z', correlationId: started.correlationId });
  approvals.decide(approval.id, { decision: 'approved', approverId: 'human-reviewer', decidedAt: '2026-08-01T00:01:00.000Z' });
  approved = true;
  const completed = await runtime.resume(started.runId, policy);
  assert.equal(completed.state, 'completed');
  assert.equal(completed.validation.status, 'accepted');
  assert.equal(source, 'assert.equal(add(1, 1), 2)');

  const database = new Database(':memory:');
  new SqliteMigrationRunner(database).apply();
  const events = new EventBus(new SqliteEventStore(database));
  await events.append({ type: 'execution.completed', aggregateId: completed.runId, payload: { state: completed.state }, idempotencyKey: `completed:${completed.runId}` });
  assert.equal((await events.list())[0].type, 'execution.completed');
  database.close();
});
