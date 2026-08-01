import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandoffEngine, InMemoryOrchestrationStore, OrchestrationError, SprintEngine, TaskEngine } from '../packages/orchestration/src/index.ts';

const budget = { inputTokens: 100, outputTokens: 50, totalTokens: 150, usedTokens: 0 };
const accepted = (evidenceId = 'validation-evidence') => ({ schemaVersion: '2.0', createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z', correlationId: 'validator', status: 'accepted', checks: [{ name: 'acceptance', passed: true, evidenceIds: [evidenceId] }], summary: 'accepted' });

function input(overrides = {}) {
  return { objective: 'Implement orchestration', includedScope: ['packages/orchestration'], excludedScope: ['dashboard'], budget, completionCriteria: ['tests pass'], risks: ['persistence is deferred'], evidenceIds: ['scope-evidence'], ...overrides };
}

test('orchestration: cria, pausa e retoma sprint; task next respeita dependências', async () => {
  const store = new InMemoryOrchestrationStore();
  const sprintEngine = new SprintEngine(store);
  const taskEngine = new TaskEngine(store, sprintEngine);
  const sprint = await sprintEngine.create(input());
  await sprintEngine.start(sprint.id);
  const first = await taskEngine.create({ sprintId: sprint.id, objective: 'Build contracts', acceptanceCriteria: ['contracts exist'], allowedFiles: ['packages/contracts'], dependencyIds: [], evidenceIds: ['contract-evidence'], budget });
  const second = await taskEngine.create({ sprintId: sprint.id, objective: 'Build engine', acceptanceCriteria: ['engine exists'], allowedFiles: ['packages/orchestration'], dependencyIds: [first.id], evidenceIds: ['engine-evidence'], budget });
  assert.equal((await taskEngine.next(sprint.id))?.id, first.id);
  await taskEngine.start(first.id);
  await taskEngine.complete(first.id, { validateTask: () => accepted(), validateSprint: () => accepted() });
  assert.equal((await taskEngine.next(sprint.id))?.id, second.id);
  await sprintEngine.pause(sprint.id);
  assert.equal((await sprintEngine.start(sprint.id)).status, 'active');
});

test('orchestration: impede conclusão sem validação aceita e permite retomada de task bloqueada', async () => {
  const store = new InMemoryOrchestrationStore();
  const sprintEngine = new SprintEngine(store);
  const taskEngine = new TaskEngine(store, sprintEngine);
  const sprint = await sprintEngine.create(input());
  await sprintEngine.start(sprint.id);
  const task = await taskEngine.create({ sprintId: sprint.id, objective: 'Run checks', acceptanceCriteria: ['checks pass'], allowedFiles: ['src'], dependencyIds: [], evidenceIds: ['task-evidence'], budget });
  await taskEngine.start(task.id);
  await taskEngine.block(task.id);
  await taskEngine.start(task.id);
  await assert.rejects(() => taskEngine.complete(task.id, { validateTask: () => ({ ...accepted(), status: 'rejected' }), validateSprint: () => accepted() }), OrchestrationError);
  assert.equal((await store.getTask(task.id)).status, 'in_progress');
  await taskEngine.complete(task.id, { validateTask: () => accepted(), validateSprint: () => accepted() });
  await assert.rejects(() => sprintEngine.complete(sprint.id, { validateTask: () => accepted(), validateSprint: () => ({ ...accepted(), status: 'inconclusive' }) }), /validation/);
  assert.equal((await store.getSprint(sprint.id)).status, 'active');
});

test('orchestration: rejeita handoff incompleto e compacta conteúdo repetido', async () => {
  const store = new InMemoryOrchestrationStore();
  const graph = { calls: [], record(value) { this.calls.push(value); } };
  const engine = new HandoffEngine(store, graph);
  await assert.rejects(() => engine.create({ from: 'a', to: 'b', intent: 'implement', objective: 'x', completedWork: [], decisions: [], constraints: [], pending: [], evidenceIds: [], acceptance: ['done'], blockers: [], nextAgent: 'b' }), /evidence/);
  const handoff = await engine.create({ from: 'a', to: 'b', intent: 'implement', objective: 'x', completedWork: ['done', 'done'], decisions: ['decision'], constraints: [], pending: ['next'], evidenceIds: ['evidence'], acceptance: ['done'], blockers: [], nextAgent: 'b' });
  assert.deepEqual(handoff.completedWork, ['done']);
  assert.equal(graph.calls[0].kind, 'handoff');
});
