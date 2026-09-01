import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { SqliteApprovalStore, SqliteContextCache, SqliteGraphStore, SqliteMigrationRunner, SqliteAuditStore, SqliteCheckpointStore, SqliteEventStore, SqliteObservationStore, SqliteOrchestrationStore, SqliteSandboxStore, SqliteRuntimeRunStore, createAuditRecord } from '../packages/adapter-sqlite/src/index.ts';
import { GraphLoop } from '../packages/graph/src/index.ts';

function db() {
  const database = new Database(':memory:');
  new SqliteMigrationRunner(database).apply();
  return database;
}

const audit = { schemaVersion: '2.0', createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z', correlationId: 'test' };

test('adapter-sqlite: migração é idempotente e persiste orquestração/sandbox/checkpoint', () => {
  const database = new Database(':memory:');
  const runner = new SqliteMigrationRunner(database);
  assert.deepEqual(runner.apply(), [1, 2, 3, 4, 5]);
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

test('adapter-sqlite: GraphLoop persiste nós, evidências, arestas e checksum', () => {
  const database = db();
  const first = new GraphLoop(new SqliteGraphStore(database));
  first.addEvidence({ id: 'graph-evidence-1', source: 'test', locator: 'fixture.ts:1', capturedAt: '2026-08-01T00:00:00.000Z', status: 'verified' });
  const mutation = { sourceKey: 'fixture.ts', sourceChecksum: 'checksum-1', nodes: [{ id: 'graph-a', type: 'File', label: 'fixture.ts', status: 'verified' }, { id: 'graph-b', type: 'File', label: 'dependency.ts', status: 'verified' }], evidence: [], edges: [{ from: 'graph-a', to: 'graph-b', type: 'DEPENDS_ON', status: 'verified', confidence: 1, evidenceIds: ['graph-evidence-1'] }] };
  assert.equal(first.apply(mutation).skipped, false);

  const second = new GraphLoop(new SqliteGraphStore(database));
  assert.equal(second.query({ type: 'File' }).length, 2);
  assert.equal(second.path('graph-a', 'graph-b').edges.length, 1);
  assert.equal(second.apply(mutation).skipped, true);
  database.close();
});

// Achado real de performance: cada saveNode/saveEdge/saveEvidence era um INSERT commitado
// individualmente — dezenas de milhares de fsyncs contra um repositório real de ~1000 documentos.
test('adapter-sqlite: SqliteGraphStore.transaction agrupa múltiplos saves num único commit', () => {
  const database = db();
  const store = new SqliteGraphStore(database);
  const graph = new GraphLoop(store);
  const result = store.transaction(() => {
    graph.addEvidence({ id: 'tx-evidence', source: 'test', locator: 'fixture.ts:1', capturedAt: '2026-08-01T00:00:00.000Z', status: 'verified' });
    graph.upsertNode({ id: 'tx-a', type: 'File', label: 'a.ts', status: 'verified' });
    graph.upsertNode({ id: 'tx-b', type: 'File', label: 'b.ts', status: 'verified' });
    graph.upsertEdge({ from: 'tx-a', to: 'tx-b', type: 'DEPENDS_ON', status: 'verified', confidence: 1, evidenceIds: ['tx-evidence'] });
    return 'committed';
  });
  assert.equal(result, 'committed');
  assert.equal(graph.query({ type: 'File' }).length, 2);
  assert.equal(graph.path('tx-a', 'tx-b').edges.length, 1);
  database.close();
});

test('adapter-sqlite: SqliteGraphStore.transaction reverte tudo se fn() lançar, e propaga o erro', () => {
  const database = db();
  const store = new SqliteGraphStore(database);
  const graph = new GraphLoop(store);
  graph.upsertNode({ id: 'pre-existing', type: 'File', label: 'pre.ts', status: 'verified' });

  assert.throws(() => {
    store.transaction(() => {
      graph.upsertNode({ id: 'tx-rollback', type: 'File', label: 'rollback.ts', status: 'verified' });
      throw new Error('falha proposital dentro da transação');
    });
  }, /falha proposital/);

  // O nó gravado antes da transação sobrevive; o gravado dentro dela nunca deveria ter sido commitado.
  assert.ok(store.getNode('pre-existing'));
  assert.equal(store.getNode('tx-rollback'), undefined, 'ROLLBACK deve desfazer o que foi gravado dentro da transação com erro');
  database.close();
});

test('adapter-sqlite: cache de contexto sobrevive no mesmo banco', () => {
  const database = db();
  const cache = new SqliteContextCache(database);
  cache.set('checksum-context', 'trecho de contexto');
  assert.equal(cache.get('checksum-context'), 'trecho de contexto');
  database.close();
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
  const approvals = new SqliteApprovalStore(database);
  const approval = { ...audit, id: 'approval-1', action: 'write', justification: 'test', impact: 'source', expectedDiff: 'src/a.ts', expiresAt: '2099-01-01T00:00:00.000Z' };
  approvals.save(approval);
  assert.equal(approvals.get('approval-1').action, 'write');
  assert.equal(approvals.list().length, 1);
});
