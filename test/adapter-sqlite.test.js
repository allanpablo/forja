import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqlitePlanningStore } from '../packages/adapter-sqlite/src/index.ts';
import { InMemoryPlanningStore, PlanningError } from '../packages/planner/src/proposal-store.ts';
import { SqliteApprovalStore, SqliteContextCache, SqliteGraphStore, SqliteMigrationRunner, SqliteAuditStore, SqliteCheckpointStore, SqliteEventStore, SqliteObservationStore, SqliteOrchestrationStore, SqliteSandboxStore, SqliteRuntimeRunStore, createAuditRecord } from '../packages/adapter-sqlite/src/index.ts';
import { GraphLoop } from '../packages/graph/src/index.ts';
import { OrchestrationError } from '../packages/orchestration/src/index.ts';

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

function executionFixture(t) {
  const database = db();
  t.after(() => database.close());
  const store = new SqliteOrchestrationStore(database);
  const beforeTask = { ...audit, id: 'task-1', sprintId: 'sprint-1', objective: 'Execute', acceptanceCriteria: ['pass'], allowedFiles: ['src'], dependencyIds: [], evidenceIds: ['e-1'], budget: { inputTokens: 10, outputTokens: 5, totalTokens: 15, usedTokens: 0 }, status: 'todo' };
  const beforeHandoff = { ...audit, id: 'handoff-1', taskId: beforeTask.id, status: 'pending', from: 'planner', to: 'worker', intent: 'implement', objective: 'Execute', completedWork: [], decisions: [], constraints: [], pending: [], evidenceIds: ['e-1'], acceptance: ['pass'], blockers: [], nextAgent: 'worker' };
  store.saveTask(beforeTask);
  store.saveHandoff(beforeHandoff);
  const task = { ...beforeTask, runtimeRunId: 'run-1', handoffId: beforeHandoff.id, status: 'in_progress' };
  const handoff = { ...beforeHandoff, runId: 'run-1', status: 'in_progress' };
  return { database, store, transition: { beforeTask, task, beforeHandoff, handoff } };
}

test('adapter-sqlite: reserva tarefa/handoff atomicamente e rejeita reserva duplicada', (t) => {
  const { database, store, transition } = executionFixture(t);
  assert.equal(store.transitionExecution(transition), undefined);
  const reopened = new SqliteOrchestrationStore(database);
  assert.deepEqual(reopened.getTask(transition.task.id), transition.task);
  assert.deepEqual(reopened.getHandoff(transition.handoff.id), transition.handoff);
  assert.throws(() => reopened.transitionExecution({ ...transition, task: { ...transition.task, runtimeRunId: 'run-2' }, handoff: { ...transition.handoff, runId: 'run-2' } }), OrchestrationError);
  assert.deepEqual(store.getTask(transition.task.id), transition.task);
  assert.deepEqual(store.getHandoff(transition.handoff.id), transition.handoff);
});

for (const target of ['task', 'handoff']) {
  test(`adapter-sqlite: conflito integral de ${target} com mesmo timestamp preserva ambos`, (t) => {
    const { store, transition } = executionFixture(t);
    if (target === 'task') store.saveTask({ ...transition.beforeTask, budget: { ...transition.beforeTask.budget, usedTokens: 1 } });
    else store.saveHandoff({ ...transition.beforeHandoff, blockers: ['concurrent'] });
    const before = { tasks: store.listTasks(), handoffs: store.listHandoffs() };
    assert.throws(() => store.transitionExecution(transition), OrchestrationError);
    assert.deepEqual({ tasks: store.listTasks(), handoffs: store.listHandoffs() }, before);
  });
}

test('adapter-sqlite: comparação JSON ignora ordem de chaves e opcionais undefined', (t) => {
  const { store, transition } = executionFixture(t);
  const beforeTask = { ...Object.fromEntries(Object.entries(transition.beforeTask).reverse()), runtimeRunId: undefined, executionError: undefined, budget: Object.fromEntries(Object.entries(transition.beforeTask.budget).reverse()) };
  store.transitionExecution({ ...transition, beforeTask, beforeHandoff: { ...transition.beforeHandoff, runId: undefined } });
  assert.deepEqual(store.getTask(transition.task.id), transition.task);
});

test('adapter-sqlite: falha real entre gravações reverte tarefa/handoff e libera savepoint', (t) => {
  const { database, store, transition } = executionFixture(t);
  database.exec(`CREATE TEMP TRIGGER fail_handoff_update BEFORE UPDATE ON forja_records
    WHEN NEW.collection = 'handoff' BEGIN SELECT RAISE(ABORT, 'injected handoff failure'); END;`);
  assert.throws(() => store.transitionExecution(transition), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
  assert.deepEqual(store.getTask(transition.beforeTask.id), transition.beforeTask);
  assert.deepEqual(store.getHandoff(transition.beforeHandoff.id), transition.beforeHandoff);
  assert.equal(database.inTransaction, false);
  database.exec('DROP TRIGGER fail_handoff_update');
  store.transitionExecution(transition);
  assert.deepEqual(store.getTask(transition.task.id), transition.task);
  assert.deepEqual(store.getHandoff(transition.handoff.id), transition.handoff);
});

test('adapter-sqlite: savepoint preserva transação externa em conflito ou falha', (t) => {
  const { database, store, transition } = executionFixture(t);
  database.exec('BEGIN');
  store.saveTask({ ...transition.beforeTask, id: 'outer-task' });
  database.exec(`CREATE TEMP TRIGGER fail_handoff_update BEFORE UPDATE ON forja_records
    WHEN NEW.collection = 'handoff' BEGIN SELECT RAISE(ABORT, 'injected handoff failure'); END;`);
  assert.throws(() => store.transitionExecution(transition), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
  assert.equal(database.inTransaction, true);
  assert.ok(store.getTask('outer-task'));
  assert.deepEqual(store.getTask(transition.task.id), transition.beforeTask);
  database.exec('DROP TRIGGER fail_handoff_update');
  store.transitionExecution(transition);
  assert.throws(() => store.transitionExecution(transition), OrchestrationError);
  assert.equal(database.inTransaction, true);
  database.exec('ROLLBACK');
  assert.equal(store.getTask('outer-task'), undefined);
  assert.deepEqual(store.getTask(transition.task.id), transition.beforeTask);
  assert.deepEqual(store.getHandoff(transition.handoff.id), transition.beforeHandoff);
});

for (const mismatch of ['task-id', 'sprint-id', 'handoff-id', 'task-pair', 'run-pair', 'missing-pair']) {
  test(`adapter-sqlite: pareamento inválido ${mismatch} não altera registros`, (t) => {
    const { store, transition } = executionFixture(t);
    const invalid = structuredClone(transition);
    if (mismatch === 'task-id') invalid.task.id = 'another';
    if (mismatch === 'sprint-id') invalid.task.sprintId = 'another';
    if (mismatch === 'handoff-id') invalid.handoff.id = 'another';
    if (mismatch === 'task-pair') invalid.handoff.taskId = 'another';
    if (mismatch === 'run-pair') invalid.handoff.runId = 'another';
    if (mismatch === 'missing-pair') delete invalid.handoff;
    assert.throws(() => store.transitionExecution(invalid), OrchestrationError);
    assert.deepEqual(store.getTask(transition.task.id), transition.beforeTask);
    assert.deepEqual(store.getHandoff(transition.handoff.id), transition.beforeHandoff);
  });
}

test('adapter-sqlite: projeção preserva vínculo e permite transição sem handoff', (t) => {
  const { store, transition } = executionFixture(t);
  store.transitionExecution(transition);
  const task = { ...transition.task, status: 'done', evidenceIds: ['checked'] };
  const handoff = { ...transition.handoff, status: 'completed', evidenceIds: ['checked'] };
  store.transitionExecution({ beforeTask: transition.task, task, beforeHandoff: transition.handoff, handoff });
  assert.deepEqual(store.getTask(task.id), task);
  assert.deepEqual(store.getHandoff(handoff.id), handoff);
  assert.throws(() => store.transitionExecution({ beforeTask: task, task: { ...task, runtimeRunId: 'replacement' }, beforeHandoff: handoff, handoff: { ...handoff, runId: 'replacement' } }), OrchestrationError);
  const independent = { ...transition.beforeTask, id: 'independent' };
  store.saveTask(independent);
  store.transitionExecution({ beforeTask: independent, task: { ...independent, runtimeRunId: 'independent-run', status: 'in_progress' } });
  assert.equal(store.getTask(independent.id).runtimeRunId, 'independent-run');
});

function planningFixture(t, kind = 'sqlite', database = db()) {
  t.after(() => { if (database.open) database.close(); });
  const orchestration = new SqliteOrchestrationStore(database);
  const budget = { inputTokens: 100, outputTokens: 50, totalTokens: 150, usedTokens: 0 };
  const dependency = { ...audit, id: 'dependency', sprintId: 'sprint', objective: 'Dependency', acceptanceCriteria: ['pass'], allowedFiles: ['src'], dependencyIds: [], evidenceIds: ['e-dependency'], budget, status: 'done' };
  const task = { ...dependency, id: 'task', objective: 'Plan', dependencyIds: [dependency.id], status: 'todo' };
  const sprint = { ...audit, id: 'sprint', objective: 'Plan', includedScope: ['src'], excludedScope: [], budget, completionCriteria: ['pass'], risks: [], taskIds: [task.id, dependency.id], evidenceIds: [], status: 'active' };
  const handoff = { ...audit, id: 'handoff', taskId: task.id, status: 'pending', from: 'planner', to: 'worker', intent: 'implement', objective: 'Plan', completedWork: [], decisions: [], constraints: ['src only'], pending: [], evidenceIds: ['e-handoff'], acceptance: ['pass'], blockers: [], nextAgent: 'worker' };
  orchestration.saveSprint(sprint);
  orchestration.saveTask(task);
  orchestration.saveTask(dependency);
  orchestration.saveHandoff(handoff);
  const proposal = { ...audit, id: 'proposal', version: 1, digest: 'digest', executor: { id: 'worker', name: 'Worker', role: 'developer', autonomy: 'supervised' }, snapshot: { task, sprint, dependencies: [dependency], handoff }, status: 'draft', blockers: [], budget: { limit: budget, briefingTokens: 10, contextTokens: 10, allocation: { inputTokens: 80, outputTokens: 50, totalTokens: 130, usedTokens: 0 } }, declaredEvidenceIds: ['e-handoff'] };
  const store = kind === 'memory' ? new InMemoryPlanningStore(orchestration) : new SqlitePlanningStore(database);
  return { database, orchestration, proposal, store };
}

function reviewed(proposal, decision = 'approved') {
  const decidedAt = '2026-08-01T00:00:00.000Z';
  return { ...structuredClone(proposal), status: decision, updatedAt: decidedAt, review: { decision, reviewerId: 'reviewer', reason: 'Checked', digest: proposal.digest, decidedAt, ...(decision === 'approved' ? { sourcesVerifiedAt: decidedAt } : {}) } };
}

function planningError(code) {
  return (error) => error instanceof PlanningError && error.code === code;
}

function reorder(value) {
  if (Array.isArray(value)) return value.map(reorder);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)]));
  return value;
}

for (const kind of ['memory', 'sqlite']) {
  test(`planning ${kind}: criação e consultas são clones JSON isolados, sem sobrescrita`, (t) => {
    const { store, proposal } = planningFixture(t, kind);
    const original = structuredClone(proposal);
    assert.equal(store.get('missing'), undefined);
    store.create(proposal);
    proposal.snapshot.task.allowedFiles.push('outside');
    store.get(proposal.id).snapshot.handoff.constraints.push('changed');
    assert.deepEqual(store.get(proposal.id), original);
    assert.throws(() => store.create(original), planningError('PLANNING_CONFLICT'));
    assert.deepEqual(store.get(proposal.id), original);
  });

  test(`planning ${kind}: aprovação usa CAS integral, ignora key order e isola after`, (t) => {
    const { store, proposal, orchestration } = planningFixture(t, kind);
    const domainBefore = { tasks: orchestration.listTasks(), sprints: orchestration.listSprints(), handoffs: orchestration.listHandoffs() };
    store.create(proposal);
    const before = { ...reorder(proposal), context: undefined };
    const after = reviewed(before);
    store.review(before, after, reorder(proposal.snapshot));
    const saved = JSON.parse(JSON.stringify(after));
    after.review.reason = 'mutated';
    assert.deepEqual(store.get(proposal.id), saved);
    assert.deepEqual({ tasks: orchestration.listTasks(), sprints: orchestration.listSprints(), handoffs: orchestration.listHandoffs() }, domainBefore);
  });

  for (const target of ['task', 'sprint', 'handoff', 'dependency']) {
    for (const operation of ['create', 'approve', 'reject']) {
      test(`planning ${kind}: ${operation} com ${target} stale e mesmo updatedAt`, (t) => {
        const { store, proposal, orchestration } = planningFixture(t, kind);
        if (operation !== 'create') store.create(proposal);
        const snapshot = proposal.snapshot;
        if (target === 'task') orchestration.saveTask({ ...snapshot.task, acceptanceCriteria: ['changed'] });
        if (target === 'sprint') orchestration.saveSprint({ ...snapshot.sprint, status: 'paused' });
        if (target === 'handoff') orchestration.saveHandoff({ ...snapshot.handoff, constraints: ['changed'] });
        if (target === 'dependency') orchestration.saveTask({ ...snapshot.dependencies[0], evidenceIds: ['changed'] });
        if (operation === 'create') {
          assert.throws(() => store.create(proposal), planningError('PLANNING_STALE'));
          assert.equal(store.get(proposal.id), undefined);
        } else if (operation === 'approve') {
          assert.throws(() => store.review(proposal, reviewed(proposal), snapshot), planningError('PLANNING_STALE'));
          assert.deepEqual(store.get(proposal.id), proposal);
        } else {
          const after = reviewed(proposal, 'rejected');
          store.review(proposal, after);
          assert.deepEqual(store.get(proposal.id), after);
        }
      });
    }
  }

  test(`planning ${kind}: aprovação exige snapshot correspondente; CAS não usa só timestamp`, (t) => {
    const { store, proposal } = planningFixture(t, kind);
    store.create(proposal);
    assert.throws(() => store.review(proposal, reviewed(proposal)), planningError('PLANNING_INVALID_REVIEW'));
    const mismatched = structuredClone(proposal.snapshot);
    mismatched.task.objective = 'different';
    assert.throws(() => store.review(proposal, reviewed(proposal), mismatched), planningError('PLANNING_INVALID_REVIEW'));
    const forged = { ...proposal, declaredEvidenceIds: ['forged'] };
    assert.throws(() => store.review(forged, reviewed(forged), forged.snapshot), planningError('PLANNING_CONFLICT'));
    assert.deepEqual(store.get(proposal.id), proposal);
  });

  for (const mutation of ['digest', 'snapshot', 'budget', 'executor', 'createdAt', 'review-digest', 'review-decision', 'reviewer', 'reason', 'missing-review', 'draft']) {
    test(`planning ${kind}: revisão inválida ${mutation} não grava`, (t) => {
      const { store, proposal } = planningFixture(t, kind);
      store.create(proposal);
      const after = reviewed(proposal);
      if (mutation === 'digest') after.digest = 'forged';
      if (mutation === 'snapshot') after.snapshot.task.allowedFiles = ['outside'];
      if (mutation === 'budget') after.budget.contextTokens += 1;
      if (mutation === 'executor') after.executor.id = 'other';
      if (mutation === 'createdAt') after.createdAt = after.updatedAt;
      if (mutation === 'review-digest') after.review.digest = 'forged';
      if (mutation === 'review-decision') after.review.decision = 'rejected';
      if (mutation === 'reviewer') after.review.reviewerId = '';
      if (mutation === 'reason') after.review.reason = '';
      if (mutation === 'missing-review') delete after.review;
      if (mutation === 'draft') after.status = 'draft';
      assert.throws(() => store.review(proposal, after, proposal.snapshot), planningError('PLANNING_INVALID_REVIEW'));
      assert.deepEqual(store.get(proposal.id), proposal);
    });
  }

  test(`planning ${kind}: decisão concorrente igual é no-op histórico; divergência conflita`, (t) => {
    const { store, proposal, orchestration } = planningFixture(t, kind);
    store.create(proposal);
    const after = reviewed(proposal);
    store.review(proposal, after, proposal.snapshot);
    orchestration.saveTask({ ...proposal.snapshot.task, status: 'cancelled' });
    const retry = { ...after, updatedAt: '2026-08-02T00:00:00.000Z', review: { ...after.review, decidedAt: '2026-08-02T00:00:00.000Z', sourcesVerifiedAt: '2026-08-02T00:00:00.000Z' } };
    store.review(proposal, retry);
    assert.deepEqual(store.get(proposal.id), after);
    assert.throws(() => store.review(proposal, reviewed(proposal, 'rejected')), planningError('PLANNING_CONFLICT'));
    assert.throws(() => store.review(proposal, { ...after, review: { ...after.review, reason: 'Other' } }, proposal.snapshot), planningError('PLANNING_CONFLICT'));
    assert.deepEqual(store.get(proposal.id), after);
  });

  test(`planning ${kind}: blocked persiste mas não pode ser revisado; criação não aceita revisão`, (t) => {
    const { store, proposal } = planningFixture(t, kind);
    assert.throws(() => store.create(reviewed(proposal)), planningError('PLANNING_INVALID_REVIEW'));
    const blocked = { ...proposal, status: 'blocked', blockers: [{ code: 'BUDGET', message: 'Insufficient' }] };
    store.create(blocked);
    for (const decision of ['approved', 'rejected']) assert.throws(() => store.review(blocked, reviewed(blocked, decision), blocked.snapshot), planningError('PLANNING_INVALID_REVIEW'));
    assert.deepEqual(store.get(proposal.id), blocked);
  });

  test(`planning ${kind}: proposta sem handoff pode ser criada e rejeitada idempotentemente`, (t) => {
    const { store, proposal } = planningFixture(t, kind);
    delete proposal.snapshot.handoff;
    store.create(proposal);
    const after = reviewed(proposal, 'rejected');
    store.review(proposal, after);
    store.review(proposal, { ...after, review: { ...after.review, decidedAt: '2026-08-02T00:00:00.000Z' } });
    assert.deepEqual(store.get(proposal.id), after);
  });

  test(`planning ${kind}: registro ausente na aprovação não altera a proposta`, (t) => {
    const { store, proposal, database } = planningFixture(t, kind);
    assert.throws(() => store.review(proposal, reviewed(proposal), proposal.snapshot), planningError('PLANNING_CONFLICT'));
    store.create(proposal);
    database.prepare('DELETE FROM forja_records WHERE collection = ? AND id = ?').run('task', proposal.snapshot.dependencies[0].id);
    assert.throws(() => store.review(proposal, reviewed(proposal), proposal.snapshot), planningError('PLANNING_STALE'));
    assert.deepEqual(store.get(proposal.id), proposal);
  });

  test(`planning ${kind}: snapshot sem dependência ou vínculo correto falha fechado`, (t) => {
    const { store, proposal } = planningFixture(t, kind);
    for (const change of [s => { s.dependencies = []; }, s => { s.sprint.id = 'other'; }, s => { s.handoff.taskId = 'other'; }]) {
      const invalid = structuredClone(proposal);
      change(invalid.snapshot);
      assert.throws(() => store.create(invalid), planningError('PLANNING_STALE'));
    }
    assert.equal(store.get(proposal.id), undefined);
  });
}

for (const method of ['getTask', 'getSprint', 'getHandoff']) {
  test(`planning memory: leitor assíncrono acidental ${method} falha sem gravar`, (t) => {
    const { orchestration, proposal } = planningFixture(t);
    let asynchronous = false;
    const reader = Object.fromEntries(['getTask', 'getSprint', 'getHandoff'].map(name => [name, id => asynchronous && name === method ? Promise.resolve(orchestration[name](id)) : orchestration[name](id)]));
    const store = new InMemoryPlanningStore(reader);
    asynchronous = true;
    assert.throws(() => store.create(proposal), planningError('PLANNING_STALE'));
    assert.equal(store.get(proposal.id), undefined);
    asynchronous = false;
    store.create(proposal);
    asynchronous = true;
    assert.throws(() => store.review(proposal, reviewed(proposal), proposal.snapshot), planningError('PLANNING_STALE'));
    assert.deepEqual(store.get(proposal.id), proposal);
    store.review(proposal, reviewed(proposal, 'rejected'));
    assert.equal(store.get(proposal.id).status, 'rejected');
  });
}

test('planning memory: Promise rejeitada do leitor é observada e falha explicitamente', (t) => {
  const { proposal, orchestration } = planningFixture(t);
  const store = new InMemoryPlanningStore({
    getTask: () => Promise.reject(new Error('asynchronous reader failure')),
    getSprint: id => orchestration.getSprint(id),
    getHandoff: id => orchestration.getHandoff(id),
  });
  assert.throws(() => store.create(proposal), planningError('PLANNING_STALE'));
  assert.equal(store.get(proposal.id), undefined);
});

for (const operation of ['create', 'review']) {
  test(`planning sqlite: falha de ${operation} libera savepoint de nível superior`, (t) => {
    const { database, store, proposal } = planningFixture(t);
    if (operation === 'review') store.create(proposal);
    database.exec(`CREATE TEMP TRIGGER fail_planning AFTER ${operation === 'create' ? 'INSERT' : 'UPDATE'} ON forja_records
      WHEN NEW.collection = 'planning_proposal' BEGIN SELECT RAISE(FAIL, 'injected planning failure'); END;`);
    const write = () => operation === 'create' ? store.create(proposal) : store.review(proposal, reviewed(proposal), proposal.snapshot);
    assert.throws(write, { code: 'SQLITE_CONSTRAINT_TRIGGER' });
    assert.equal(database.inTransaction, false);
    assert.deepEqual(store.get(proposal.id), operation === 'create' ? undefined : proposal);
    database.exec('DROP TRIGGER fail_planning');
    write();
    assert.equal(database.inTransaction, false);
  });

  test(`planning sqlite: falha após ${operation} realmente gravar faz rollback e preserva transação externa`, (t) => {
    const { database, store, proposal, orchestration } = planningFixture(t);
    if (operation === 'review') store.create(proposal);
    database.exec('BEGIN');
    orchestration.saveTask({ ...proposal.snapshot.task, id: 'outer-task' });
    // RAISE(FAIL), unlike ABORT, leaves this statement's writes in place until the store rolls back.
    database.exec(`CREATE TEMP TRIGGER fail_planning AFTER ${operation === 'create' ? 'INSERT' : 'UPDATE'} ON forja_records
      WHEN NEW.collection = 'planning_proposal' BEGIN SELECT RAISE(FAIL, 'injected planning failure'); END;`);
    const write = () => operation === 'create' ? store.create(proposal) : store.review(proposal, reviewed(proposal), proposal.snapshot);
    assert.throws(write, { code: 'SQLITE_CONSTRAINT_TRIGGER' });
    assert.equal(database.inTransaction, true);
    assert.ok(orchestration.getTask('outer-task'));
    assert.deepEqual(store.get(proposal.id), operation === 'create' ? undefined : proposal);
    database.exec('DROP TRIGGER fail_planning');
    write();
    database.exec('ROLLBACK');
    assert.equal(database.inTransaction, false);
    assert.equal(orchestration.getTask('outer-task'), undefined);
    assert.deepEqual(store.get(proposal.id), operation === 'create' ? undefined : proposal);
    write();
    assert.equal(database.inTransaction, false);
  });
}

test('planning sqlite: fixture em arquivo sobrevive close/reopen sem alterar domínio ou criar runs/grants', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'forja-planning-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'planning.db');
  const first = new Database(filename);
  new SqliteMigrationRunner(first).apply();
  const { proposal, store } = planningFixture(t, 'sqlite', first);
  const domain = first.prepare("SELECT * FROM forja_records WHERE collection != 'planning_proposal' ORDER BY collection, id").all();
  store.create(proposal);
  store.review(proposal, reviewed(proposal), proposal.snapshot);
  first.close();
  const second = new Database(filename);
  try {
    assert.deepEqual(new SqliteMigrationRunner(second).apply(), []);
    assert.deepEqual(new SqlitePlanningStore(second).get(proposal.id), reviewed(proposal));
    assert.deepEqual(second.prepare("SELECT * FROM forja_records WHERE collection != 'planning_proposal' ORDER BY collection, id").all(), domain);
    assert.equal(second.prepare('SELECT count(*) AS count FROM runtime_runs').get().count, 0);
    assert.equal(second.prepare('SELECT count(*) AS count FROM policy_approvals').get().count, 0);
  } finally { second.close(); }
});
