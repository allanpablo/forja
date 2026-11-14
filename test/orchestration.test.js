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

test('orchestration: detecta atualização concorrente de sprint entre a leitura e a escrita', async () => {
  const sprints = new Map();
  let getCalls = 0;
  const store = {
    async getSprint(id) {
      getCalls += 1;
      // The guard re-reads right before writing (2nd call per mutation); simulate another writer
      // landing in that exact window, after the engine already captured its own `before` snapshot.
      if (getCalls === 2) sprints.set(id, { ...sprints.get(id), updatedAt: '2099-01-01T00:00:00.000Z' });
      return sprints.get(id);
    },
    async saveSprint(value) { sprints.set(value.id, value); },
    async listSprints() { return [...sprints.values()]; },
    async saveTask() {}, async getTask() { return undefined; }, async listTasks() { return []; },
    async saveHandoff() {}, async getHandoff() { return undefined; }, async listHandoffs() { return []; },
  };
  const sprintEngine = new SprintEngine(store);
  const created = await sprintEngine.create(input());
  await assert.rejects(() => sprintEngine.start(created.id), /modified concurrently/);
});

test('orchestration: barra cadeia de handoff sem limite (loop sem gate humano)', async () => {
  const store = new InMemoryOrchestrationStore();
  const engine = new HandoffEngine(store, undefined, 20, 500, 2);
  const make = (from, to) => engine.create({ from, to, intent: 'loop', objective: 'x', completedWork: [], decisions: [], constraints: [], pending: [], evidenceIds: ['e'], acceptance: ['done'], blockers: [], nextAgent: to, correlationId: 'run-loop' });
  await make('a', 'b');
  await make('b', 'a');
  await assert.rejects(() => make('a', 'b'), /Handoff chain exceeded/);
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

const taskInput = (sprintId, overrides = {}) => ({ sprintId, objective: 'Execute task', acceptanceCriteria: ['checks pass'], allowedFiles: ['src'], dependencyIds: [], evidenceIds: ['evidence'], budget, ...overrides });
const handoffInput = (overrides = {}) => ({ from: 'planner', to: 'worker', intent: 'implement', objective: 'Execute task', completedWork: [], decisions: [], constraints: [], pending: [], evidenceIds: ['evidence'], acceptance: ['checks pass'], blockers: [], nextAgent: 'worker', ...overrides });
async function setupTasks() {
  const store = new InMemoryOrchestrationStore();
  const sprints = new SprintEngine(store);
  const tasks = new TaskEngine(store, sprints);
  const sprint = await sprints.create(input());
  await sprints.start(sprint.id);
  return { store, sprints, tasks, sprint };
}

test('orchestration: start direto e retomada bloqueada não contornam dependências', async () => {
  const { store, tasks, sprint } = await setupTasks();
  const first = await tasks.create(taskInput(sprint.id));
  const second = await tasks.create(taskInput(sprint.id, { dependencyIds: [first.id] }));
  for (const status of ['todo', 'blocked']) {
    store.saveTask({ ...second, status });
    await assert.rejects(() => tasks.start(second.id), OrchestrationError);
    assert.equal(store.getTask(second.id).status, status);
  }
});

for (const dependency of ['missing', 'other-sprint']) {
  test(`orchestration: create rejeita dependência ${dependency} sem salvar tarefa`, async () => {
    const { store, sprints, tasks, sprint } = await setupTasks();
    const other = await sprints.create(input());
    const foreign = await tasks.create(taskInput(other.id));
    const before = store.listTasks();
    await assert.rejects(() => tasks.create(taskInput(sprint.id, { dependencyIds: [dependency === 'missing' ? 'missing' : foreign.id] })), OrchestrationError);
    assert.deepEqual(store.listTasks(), before);
    assert.deepEqual(store.getSprint(sprint.id).taskIds, []);
  });
}

test('orchestration: assertEligible revalida dependências persistidas e junção exige todas done', async () => {
  const { store, tasks, sprint } = await setupTasks();
  const first = await tasks.create(taskInput(sprint.id));
  const second = await tasks.create(taskInput(sprint.id));
  const join = await tasks.create(taskInput(sprint.id, { dependencyIds: [first.id, second.id] }));
  await tasks.start(first.id);
  await tasks.complete(first.id, { validateTask: () => accepted() });
  await assert.rejects(() => tasks.assertEligible(join), OrchestrationError);
  await tasks.start(second.id);
  await tasks.complete(second.id, { validateTask: () => accepted() });
  await tasks.assertEligible(join);
  assert.equal((await tasks.next(sprint.id)).id, join.id);
  store.saveTask({ ...store.getTask(second.id), sprintId: 'another-sprint' });
  await assert.rejects(() => tasks.assertEligible(join), OrchestrationError);
  await assert.rejects(() => tasks.start(join.id), OrchestrationError);
  assert.equal(await tasks.next(sprint.id), undefined);
  store.saveTask({ ...join, dependencyIds: ['missing'] });
  await assert.rejects(() => tasks.assertEligible(store.getTask(join.id)), OrchestrationError);
  assert.equal(await tasks.next(sprint.id), undefined);
});

for (const status of ['planned', 'paused', 'completed', 'cancelled']) {
  test(`orchestration: sprint ${status} não oferece nem inicia tarefas`, async () => {
    const { store, tasks, sprint } = await setupTasks();
    const task = await tasks.create(taskInput(sprint.id));
    store.saveSprint({ ...store.getSprint(sprint.id), status });
    assert.equal(await tasks.next(sprint.id), undefined);
    await assert.rejects(() => tasks.start(task.id), OrchestrationError);
    await assert.rejects(() => tasks.assertEligible(task), OrchestrationError);
  });
}

test('orchestration: next ordena por createdAt/id e ignora todo já reservado', async () => {
  const { store, tasks, sprint } = await setupTasks();
  const base = await tasks.create(taskInput(sprint.id));
  store.saveTask({ ...base, status: 'cancelled' });
  const time = '2026-01-01T00:00:00.000Z';
  store.saveTask({ ...base, id: 'z', createdAt: time });
  store.saveTask({ ...base, id: 'a', createdAt: time });
  store.saveTask({ ...base, id: 'reserved', createdAt: '2025-01-01T00:00:00.000Z', runtimeRunId: 'run-existing' });
  assert.equal((await tasks.next(sprint.id)).id, 'a');
  store.saveTask({ ...base, id: 'older', createdAt: '2025-06-01T00:00:00.000Z' });
  assert.equal((await tasks.next(sprint.id)).id, 'older');
});

for (const [method, status] of [['start', 'todo'], ['start', 'blocked'], ['block', 'in_progress'], ['complete', 'in_progress']]) {
  test(`orchestration: ${method} manual rejeita tarefa ${status} vinculada`, async () => {
    const { store, tasks, sprint } = await setupTasks();
    const task = await tasks.create(taskInput(sprint.id));
    const linked = { ...task, status, runtimeRunId: 'run-existing' };
    store.saveTask(linked);
    let validated = false;
    await assert.rejects(() => tasks[method](task.id, { validateTask: () => { validated = true; return accepted(); } }), OrchestrationError);
    assert.equal(validated, false);
    assert.deepEqual(store.getTask(task.id), linked);
  });
}

test('orchestration: vínculo criado durante validator não é sobrescrito mesmo com updatedAt igual', async () => {
  const { store, tasks, sprint } = await setupTasks();
  const created = await tasks.create(taskInput(sprint.id));
  const task = await tasks.start(created.id);
  const entered = Promise.withResolvers();
  const validation = Promise.withResolvers();
  const completing = tasks.complete(task.id, { validateTask: () => { entered.resolve(); return validation.promise; } });
  await entered.promise;
  const linked = { ...task, runtimeRunId: 'run-concurrent' };
  store.saveTask(linked);
  validation.resolve(accepted());
  await assert.rejects(() => completing, OrchestrationError);
  assert.deepEqual(store.getTask(task.id), linked);
});

test('orchestration: handoff vincula tarefa aberta e não aceita estado/run do caller', async () => {
  const { store, tasks, sprint } = await setupTasks();
  const task = await tasks.create(taskInput(sprint.id));
  const engine = new HandoffEngine(store);
  const handoff = await engine.create(handoffInput({ taskId: task.id, runId: 'forged', status: 'completed' }));
  assert.equal(handoff.taskId, task.id);
  assert.equal(handoff.status, 'pending');
  assert.equal(handoff.runId, undefined);
  assert.equal(handoff.nextAgent, 'worker');
  const unlinked = await engine.create(handoffInput({ runId: 'forged', status: 'completed' }));
  for (const key of ['taskId', 'runId', 'status']) assert.equal(Object.hasOwn(unlinked, key), false);
});

for (const taskId of ['', '  ', null, 42, 'missing']) {
  test(`orchestration: handoff rejeita taskId inválido/inexistente ${JSON.stringify(taskId)}`, async () => {
    const store = new InMemoryOrchestrationStore();
    await assert.rejects(() => new HandoffEngine(store).create(handoffInput({ taskId })), OrchestrationError);
    assert.equal(store.listHandoffs().length, 0);
  });
}

for (const reason of ['completed', 'cancelled', 'missing-sprint', 'linked']) {
  test(`orchestration: handoff rejeita tarefa indisponível ${reason}`, async () => {
    const { store, tasks, sprint } = await setupTasks();
    const task = await tasks.create(taskInput(sprint.id));
    if (reason === 'linked') store.saveTask({ ...task, runtimeRunId: 'existing' });
    else if (reason === 'missing-sprint') store.saveTask({ ...task, sprintId: 'missing' });
    else store.saveSprint({ ...store.getSprint(sprint.id), status: reason });
    await assert.rejects(() => new HandoffEngine(store).create(handoffInput({ taskId: task.id })), OrchestrationError);
    assert.equal(store.listHandoffs().length, 0);
  });
}

async function executionFixture() {
  const { store, tasks, sprint } = await setupTasks();
  const beforeTask = await tasks.create(taskInput(sprint.id));
  const beforeHandoff = await new HandoffEngine(store).create(handoffInput({ taskId: beforeTask.id }));
  const task = { ...beforeTask, runtimeRunId: 'run-1', handoffId: beforeHandoff.id, status: 'in_progress' };
  const handoff = { ...beforeHandoff, runId: 'run-1', status: 'in_progress' };
  return { store, transition: { beforeTask, task, beforeHandoff, handoff } };
}

test('orchestration: transição atômica reserva ambos e impede reserva duplicada', async () => {
  const { store, transition } = await executionFixture();
  assert.equal(store.transitionExecution(transition), undefined, 'operação em memória é síncrona');
  assert.deepEqual(store.getTask(transition.task.id), transition.task);
  assert.deepEqual(store.getHandoff(transition.handoff.id), transition.handoff);
  assert.throws(() => store.transitionExecution({ ...transition, task: { ...transition.task, runtimeRunId: 'run-2' }, handoff: { ...transition.handoff, runId: 'run-2' } }), OrchestrationError);
  assert.deepEqual(store.getTask(transition.task.id), transition.task);
  assert.deepEqual(store.getHandoff(transition.handoff.id), transition.handoff);
});

for (const target of ['task', 'handoff']) {
  test(`orchestration: conflito no snapshot completo de ${target} não grava nenhum registro`, async () => {
    const { store, transition } = await executionFixture();
    const changed = { ...transition[target === 'task' ? 'beforeTask' : 'beforeHandoff'], evidenceIds: ['concurrent'] };
    if (target === 'task') store.saveTask(changed); else store.saveHandoff(changed);
    const before = { tasks: store.listTasks(), handoffs: store.listHandoffs() };
    assert.throws(() => store.transitionExecution(transition), OrchestrationError);
    assert.deepEqual({ tasks: store.listTasks(), handoffs: store.listHandoffs() }, before);
  });
}

test('orchestration: snapshots têm semântica JSON e não compartilham referências mutáveis', async () => {
  const { store, transition } = await executionFixture();
  const read = store.getTask(transition.beforeTask.id);
  read.evidenceIds.push('not-persisted');
  assert.deepEqual(store.getTask(read.id), transition.beforeTask);
  const beforeTask = { ...Object.fromEntries(Object.entries(transition.beforeTask).reverse()), runtimeRunId: undefined, executionError: undefined };
  store.transitionExecution({ ...transition, beforeTask });
  transition.task.evidenceIds.push('not-persisted-either');
  assert.deepEqual(store.getTask(read.id).evidenceIds, ['evidence']);
});

for (const mismatch of ['task-id', 'sprint-id', 'handoff-id', 'task-pair', 'run-pair', 'missing-pair', 'empty-run']) {
  test(`orchestration: transição rejeita pareamento incoerente ${mismatch}`, async () => {
    const { store, transition } = await executionFixture();
    const invalid = structuredClone(transition);
    if (mismatch === 'task-id') invalid.task.id = 'another';
    if (mismatch === 'sprint-id') invalid.task.sprintId = 'another';
    if (mismatch === 'handoff-id') invalid.handoff.id = 'another';
    if (mismatch === 'task-pair') invalid.handoff.taskId = 'another';
    if (mismatch === 'run-pair') invalid.handoff.runId = 'another';
    if (mismatch === 'missing-pair') delete invalid.beforeHandoff;
    if (mismatch === 'empty-run') { invalid.task.runtimeRunId = ''; invalid.handoff.runId = ''; }
    assert.throws(() => store.transitionExecution(invalid), OrchestrationError);
    assert.deepEqual(store.getTask(transition.beforeTask.id), transition.beforeTask);
    assert.deepEqual(store.getHandoff(transition.beforeHandoff.id), transition.beforeHandoff);
  });
}

test('orchestration: projeção mantém vínculo e tarefa avulsa também permite transição', async () => {
  const { store, transition } = await executionFixture();
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

test('orchestration: recuperação bloqueia vínculo quebrado sem modificar handoff alheio', async () => {
  const { store, transition } = await executionFixture();
  store.transitionExecution(transition);
  const foreign = { ...transition.handoff, taskId: 'other-task' };
  store.saveHandoff(foreign);
  const blocked = { ...transition.task, status: 'blocked', executionError: { code: 'BINDING_MISMATCH', message: 'Invalid binding', retryable: false } };
  store.transitionExecution({ recoveryBlock: true, beforeTask: transition.task, task: blocked });
  assert.deepEqual(store.getTask(blocked.id), blocked);
  assert.deepEqual(store.getHandoff(foreign.id), foreign);
});

for (const invalid of ['done', 'missing-diagnostic', 'replace-run', 'replace-scope']) {
  test(`orchestration: recuperação não permite ${invalid}`, async () => {
    const { store, transition } = await executionFixture();
    const beforeTask = { ...transition.task, executionScopeHash: 'v1:original' };
    store.transitionExecution({ ...transition, task: beforeTask });
    const task = { ...beforeTask, status: 'blocked', executionError: { code: 'BINDING_MISMATCH', message: 'Invalid binding', retryable: false } };
    if (invalid === 'done') task.status = 'done';
    if (invalid === 'missing-diagnostic') delete task.executionError;
    if (invalid === 'replace-run') task.runtimeRunId = 'other-run';
    if (invalid === 'replace-scope') task.executionScopeHash = 'v1:changed';
    assert.throws(() => store.transitionExecution({ recoveryBlock: true, beforeTask, task }), OrchestrationError);
    assert.deepEqual(store.getTask(beforeTask.id), beforeTask);
    assert.deepEqual(store.getHandoff(transition.handoff.id), transition.handoff);
  });
}

test('orchestration: erro ao preparar handoff não grava tarefa em memória', async () => {
  const { store, transition } = await executionFixture();
  const handoff = { ...transition.handoff };
  handoff.decisions = [handoff]; // A non-serializable caller value must fail before either write.
  assert.throws(() => store.transitionExecution({ ...transition, handoff }), TypeError);
  assert.deepEqual(store.getTask(transition.task.id), transition.beforeTask);
  assert.deepEqual(store.getHandoff(transition.handoff.id), transition.beforeHandoff);
});

test('orchestration: validator não pode alterar o snapshot usado na conclusão manual', async () => {
  const { store, tasks, sprint } = await setupTasks();
  const created = await tasks.create(taskInput(sprint.id));
  const before = await tasks.start(created.id);
  const result = await tasks.complete(before.id, { validateTask: (task) => { task.evidenceIds.push('forged'); task.runtimeRunId = 'forged'; return accepted(); } });
  assert.deepEqual(result.evidenceIds, ['evidence', 'validation-evidence']);
  assert.equal(store.getTask(before.id).runtimeRunId, undefined);
});
