import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { SqliteMigrationRunner, SqliteAuditStore, SqliteCheckpointStore, SqliteEventStore, SqliteObservationStore, SqliteOrchestrationStore, SqliteSandboxStore, SqliteRuntimeRunStore, createAuditRecord } from '../packages/adapter-sqlite/src/index.ts';

function db() {
  const database = new Database(':memory:');
  new SqliteMigrationRunner(database).apply();
  return database;
}

const audit = { schemaVersion: '2.0', createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z', correlationId: 'test' };

test('adapter-sqlite: migração é idempotente e persiste orquestração/sandbox/checkpoint', () => {
  const database = new Database(':memory:');
  const runner = new SqliteMigrationRunner(database);
  assert.deepEqual(runner.apply(), [1]);
  assert.deepEqual(runner.apply(), []);
  const orchestration = new SqliteOrchestrationStore(database);
  const sprint = { ...audit, id: 'sprint-1', objective: 'Persist', includedScope: ['packages'], excludedScope: [], budget: { inputTokens: 10, outputTokens: 5, totalTokens: 15, usedTokens: 0 }, completionCriteria: ['test'], risks: [], taskIds: [], evidenceIds: ['e-1'], status: 'paused' };
  orchestration.saveSprint(sprint);
  assert.equal(orchestration.getSprint('sprint-1').status, 'paused');
  assert.equal(orchestration.listSprints().length, 1);
  const sandbox = new SqliteSandboxStore(database);
  const session = { ...audit, id: 'sandbox-1', runId: 'run-1', backend: 'git_worktree', root: '/tmp/sandbox', state: 'prepared', promoted: false };
  sandbox.save(session);
  assert.equal(sandbox.get('sandbox-1').state, 'prepared');
  const checkpoints = new SqliteCheckpointStore(database);
  checkpoints.save({ ...audit, id: 'checkpoint-1', runId: 'run-1', step: 2, state: 'paused', checksum: 'sum', resumable: true });
  assert.equal(checkpoints.get('run-1').resumable, true);
});

test('adapter-sqlite: eventos são idempotentes e auditoria/runtime são recuperáveis', () => {
  const database = db();
  const events = new SqliteEventStore(database);
  const event = { ...audit, id: 'event-1', type: 'task.created', aggregateId: 'task-1', sequence: 1, payload: { task: 'x' }, idempotencyKey: 'task-1-created' };
  events.append(event);
  events.append(event);
  assert.equal(events.list().length, 1);
  assert.deepEqual(events.list()[0].payload, { task: 'x' });
  const auditStore = new SqliteAuditStore(database);
  auditStore.append(createAuditRecord({ action: 'task.complete', aggregateId: 'task-1', outcome: 'success', evidenceIds: ['e-1'] }));
  assert.equal(auditStore.list().length, 1);
  const runs = new SqliteRuntimeRunStore(database);
  const run = { ...audit, runId: 'run-1', objective: 'test', agent: { id: 'agent-1', name: 'test', role: 'developer', autonomy: 'supervised' }, policy: { effect: 'ALLOW', reason: 'test', policyId: 'p-1' }, budget: { inputTokens: 10, outputTokens: 5, totalTokens: 15, usedTokens: 0 }, state: 'paused', steps: 1, evidence: [], changedFiles: [], metrics: { attempts: 1, retries: 0, durationMs: 1, inputTokens: 1, outputTokens: 1 } };
  runs.save(run);
  assert.equal(runs.get('run-1').state, 'paused');
  const observations = new SqliteObservationStore(database);
  observations.append({ ...audit, id: 'observation-1', traceId: 'trace-1', contextRefs: ['context-1'], inputTokens: 1, outputTokens: 1, durationMs: 2, cost: 0, tools: [], files: [], commands: [], outcome: 'succeeded' });
  assert.equal(observations.list().length, 1);
});
