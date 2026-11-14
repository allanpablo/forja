import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CapabilityRegistry } from '../packages/core/src/index.ts';
import { PolicyEngine } from '../packages/policy/src/index.ts';
import { InMemoryCheckpointStore, RuntimeEngine, RuntimeError } from '../packages/runtime/src/index.ts';
import { SqliteMigrationRunner, SqliteRuntimePersistence } from '../packages/adapter-sqlite/src/index.ts';

const now = '2026-07-31T00:00:00.000Z';
const agent = { id: 'agent-1', name: 'developer', role: 'developer', autonomy: 'supervised' };
const definition = {
  schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'runtime-test', id: 'test.echo', version: '1.0.0',
  description: 'Echo input', permissions: ['read'], risk: 'low', sideEffects: [], requirements: [], supportsAutonomy: true,
  idempotent: true, timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [],
};
const budget = { inputTokens: 100, outputTokens: 100, totalTokens: 200, usedTokens: 0 };
const allow = { authorize: () => ({ effect: 'ALLOW', reason: 'test', policyId: 'test' }) };

function evaluation(status = 'accepted') {
  return { schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'validation', status, checks: [], summary: status };
}

function setup({ handler = (input) => ({ capabilityId: definition.id, payload: input, evidence: [] }), planner, validator = { validate: () => evaluation() }, policy = allow, checkpointStore = new InMemoryCheckpointStore(), persistence, contextBuilder } = {}) {
  const registry = new CapabilityRegistry();
  registry.register({ definition, validateInput: (input) => input, validateOutput: (output) => output, handler });
  const engine = new RuntimeEngine({ registry, planner: planner ?? { plan: () => [{ capabilityId: definition.id, payload: 'one', estimatedTokens: 10, files: ['src/a.ts'] }, { capabilityId: definition.id, payload: 'two', estimatedTokens: 10, files: ['src/b.ts'] }] }, validator, checkpointStore, persistence, contextBuilder });
  return { engine, checkpointStore, policy };
}

function deferred() {
  return Promise.withResolvers();
}

function runtimePersistence() {
  const data = new Map();
  const record = (id) => { if (!data.has(id)) data.set(id, {}); return data.get(id); };
  return {
    data,
    saveRun(run) { record(run.runId).run = structuredClone(run); },
    getRun(id) { return record(id).run; },
    savePlan(id, plan) { record(id).plan = structuredClone(plan); },
    getPlan(id) { return record(id).plan; },
    saveResults(id, results) { record(id).results = structuredClone(results); },
    getResults(id) { return record(id).results; },
    saveCursor(id, nextStep, startedAt) { record(id).cursor = { nextStep, startedAt }; },
    getCursor(id) { return record(id).cursor; },
  };
}

const singleStep = { plan: () => [{ capabilityId: definition.id, payload: 'once', estimatedTokens: 1 }] };

async function startAndExecute(engine, policy = allow, budgetOverride = budget) {
  const run = await engine.start({ objective: 'test runtime', agent, budget: budgetOverride, policy });
  return engine.execute(run.runId);
}

for (const target of ['run', 'checkpoint']) {
  test(`runtime: dado save ${target} terminal bloqueado, execute e get aguardam confirmação`, async () => {
    const entered = deferred();
    const gate = deferred();
    const persistence = runtimePersistence();
    const checkpointStore = new InMemoryCheckpointStore();
    const owner = target === 'run' ? persistence : checkpointStore;
    const method = target === 'run' ? 'saveRun' : 'save';
    const save = owner[method].bind(owner);
    owner[method] = async (value) => {
      if (value.state === 'completed') { entered.resolve(); await gate.promise; }
      save(value);
    };
    const { engine } = setup({ persistence, checkpointStore, planner: singleStep });
    const run = await engine.start({ objective: 'durable', agent, budget, policy: allow });
    let settled = false;
    const executing = engine.execute(run.runId).finally(() => { settled = true; });
    await entered.promise;
    const visible = engine.get(run.runId).state;
    const pending = !settled;
    gate.resolve();
    assert.equal((await executing).state, 'completed');
    assert.notEqual(visible, 'completed');
    assert.equal(pending, true);
  });
}

for (const target of ['terminal', 'results', 'cursor', 'checkpoint', 'plan']) {
  test(`runtime: dado save ${target} rejeitado, caller recebe erro sem replay do handler`, async () => {
    const failure = new Error('storage unavailable');
    const persistence = runtimePersistence();
    const checkpointStore = new InMemoryCheckpointStore();
    let calls = 0;
    const { engine } = setup({ persistence, checkpointStore, planner: singleStep, handler: (input) => {
      calls += 1;
      return { capabilityId: definition.id, payload: input, evidence: [] };
    } });
    if (target === 'plan') {
      persistence.savePlan = async () => { throw failure; };
      await assert.rejects(engine.start({ runId: 'plan-save-failed', objective: 'failure', agent, budget, policy: allow }), (error) => error === failure);
      assert.equal(calls, 0);
      return;
    }
    const run = await engine.start({ objective: 'failure', agent, budget, policy: allow });
    if (target === 'terminal') {
      const save = persistence.saveRun;
      persistence.saveRun = async (value) => { if (value.state === 'completed') throw failure; save(value); };
    } else if (target === 'checkpoint') {
      checkpointStore.save = async () => { throw failure; };
    } else {
      persistence[target === 'results' ? 'saveResults' : 'saveCursor'] = async () => { throw failure; };
    }
    await assert.rejects(engine.execute(run.runId), (error) => error === failure);
    assert.notEqual(engine.get(run.runId).state, 'completed');
    await assert.rejects(engine.execute(run.runId), (error) => error === failure);
    assert.equal(calls, 1);
  });
}

for (const recovered of [false, true]) {
  test(`runtime: dado run ${recovered ? 'recuperado' : 'carregado'}, execute/resume concorrentes compartilham execução`, async () => {
    const entered = deferred();
    const gate = deferred();
    const persistence = runtimePersistence();
    let calls = 0;
    const options = { persistence, planner: singleStep, handler: async (input) => {
      calls += 1; entered.resolve(); await gate.promise;
      return { capabilityId: definition.id, payload: input, evidence: [] };
    } };
    let { engine } = setup(options);
    const run = await engine.start({ objective: 'single flight', agent, budget, policy: allow });
    if (recovered) {
      persistence.saveRun({ ...run, state: 'paused' });
      engine = setup(options).engine;
    }
    const first = recovered ? engine.resume(run.runId, allow) : engine.execute(run.runId);
    const second = recovered ? engine.resume(run.runId, allow) : engine.execute(run.runId);
    const third = engine.resume(run.runId, allow);
    const joined = Promise.all([first, second, third]);
    await entered.promise;
    gate.resolve();
    const results = await joined;
    assert.strictEqual(first, second);
    assert.strictEqual(first, third);
    assert.ok(results.every((value) => value.state === 'completed'));
    assert.equal(calls, 1);
  });
}

for (const boundary of ['handler', 'validator']) {
  test(`runtime: dado ${boundary} pendente, cancelamento prevalece sobre retorno tardio`, async () => {
    const entered = deferred();
    const gate = deferred();
    let calls = 0;
    const { engine } = setup({ planner: singleStep,
      handler: async (input) => {
        calls += 1;
        if (boundary === 'handler') { entered.resolve(); await gate.promise; }
        return { capabilityId: definition.id, payload: input, evidence: [] };
      },
      validator: { validate: async () => { entered.resolve(); await gate.promise; return evaluation(); } },
    });
    const run = await engine.start({ objective: 'cancel boundary', agent, budget, policy: allow });
    const executing = engine.execute(run.runId);
    await entered.promise;
    let settled = false;
    const cancelling = engine.cancel(run.runId).then((value) => { settled = true; return value; });
    await Promise.resolve();
    const pending = !settled;
    gate.resolve();
    assert.equal((await executing).state, 'cancelled');
    assert.equal((await cancelling).state, 'cancelled');
    assert.equal(engine.get(run.runId).state, 'cancelled');
    assert.equal(pending, true);
    assert.equal(calls, 1);
  });
}

test('runtime: dado terminal de planejamento sem plano, recover preserva falha', async () => {
  const persistence = runtimePersistence();
  const { engine } = setup({ persistence, planner: { plan() { throw new Error('planning'); } } });
  const run = await engine.start({ objective: 'no plan', agent, budget, policy: allow });
  assert.equal(run.state, 'failed');
  assert.equal(persistence.getPlan(run.runId), undefined);
  const recovered = setup({ persistence }).engine;
  assert.deepEqual(await recovered.recover(run.runId, allow), run);
  assert.deepEqual(await recovered.execute(run.runId), run);
});

for (const missing of ['cursor', 'plan']) {
  test(`runtime: dado não-terminal sem ${missing}, recover falha tipado sem inferir steps`, async () => {
    const persistence = runtimePersistence();
    const run = await setup({ persistence }).engine.start({ objective: 'incomplete', agent, budget, policy: allow });
    persistence.saveRun({ ...run, state: 'paused', steps: 2 });
    delete persistence.data.get(run.runId)[missing];
    const recovered = setup({ persistence }).engine;
    await assert.rejects(recovered.recover(run.runId, allow), (error) => error instanceof RuntimeError && error.code === 'RECOVERY_INCOMPLETE');
    assert.equal(recovered.has(run.runId), false);
  });
}

test('runtime: dado recover concorrente, não sobrescreve execução carregada', async () => {
  const persistence = runtimePersistence();
  const entered = deferred();
  const gate = deferred();
  const { engine } = setup({ persistence, planner: singleStep, handler: async (input) => {
    entered.resolve(); await gate.promise; return { capabilityId: definition.id, payload: input, evidence: [] };
  } });
  const run = await engine.start({ objective: 'recover race', agent, budget, policy: allow });
  const stale = persistence.getRun(run.runId);
  persistence.getRun = () => stale;
  const executing = engine.execute(run.runId);
  await entered.promise;
  const current = engine.get(run.runId);
  const recovered = await engine.recover(run.runId, allow);
  gate.resolve();
  assert.equal((await executing).steps, 1);
  assert.strictEqual(recovered, current);
});

test('runtime: dado resume inválido, rejeição não impede execute posterior', async () => {
  const { engine } = setup();
  const run = await engine.start({ objective: 'invalid resume', agent, budget, policy: allow });
  await assert.rejects(engine.resume(run.runId), (error) => error.code === 'RUN_NOT_RESUMABLE');
  assert.equal((await engine.execute(run.runId)).state, 'completed');
});

test('runtime: dado terminal sendo persistido, cancelamento ainda prevalece antes de publicar', async () => {
  const persistence = runtimePersistence();
  const entered = deferred();
  const gate = deferred();
  const save = persistence.saveRun;
  persistence.saveRun = async (run) => {
    if (run.state === 'completed') { entered.resolve(); await gate.promise; }
    save(run);
  };
  const { engine } = setup({ persistence, planner: singleStep });
  const run = await engine.start({ objective: 'late cancel', agent, budget, policy: allow });
  const executing = engine.execute(run.runId);
  await entered.promise;
  const cancelling = engine.cancel(run.runId);
  gate.resolve();
  assert.equal((await executing).state, 'cancelled');
  assert.equal((await cancelling).state, 'cancelled');
  assert.equal(persistence.getRun(run.runId).state, 'cancelled');
  assert.equal(engine.get(run.runId).validation, undefined);
});

test('runtime: dado ID do host e contexto explícito, preserva vínculo e não usa contextBuilder', async () => {
  const contexts = [];
  const { engine } = setup({ contextBuilder: { build() { assert.fail('Contexto é por chamada'); } }, planner: { plan(_objective, context) { contexts.push(context); return []; } } });
  const context = { task: 'first' };
  const first = await engine.start({ runId: 'host-first', handoffId: 'handoff-first', context, objective: 'same', agent, budget, policy: allow });
  const second = await engine.start({ runId: 'host-second', context: undefined, objective: 'same', agent, budget, policy: allow });
  assert.equal(first.runId, 'host-first');
  assert.equal(first.handoffId, 'handoff-first');
  assert.equal(second.runId, 'host-second');
  assert.deepEqual(contexts, [context, undefined]);
  assert.equal(engine.has(first.runId), true);
});

test('runtime: dado ID existente ou start concorrente, colisão não sobrescreve run', async () => {
  const persistence = runtimePersistence();
  const { engine } = setup({ persistence });
  const request = { runId: 'host-unique', objective: 'unique', agent, budget, policy: allow };
  const results = await Promise.allSettled([engine.start(request), engine.start(request)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'RUN_ID_COLLISION');
  const saved = persistence.getRun(request.runId);
  await assert.rejects(engine.start(request), (error) => error.code === 'RUN_ID_COLLISION');
  await assert.rejects(setup({ persistence }).engine.start(request), (error) => error.code === 'RUN_ID_COLLISION');
  assert.deepEqual(persistence.getRun(request.runId), saved);
});

test('runtime: executa plano, valida e grava checkpoint auditável', async () => {
  const { engine, checkpointStore } = setup();
  const run = await startAndExecute(engine);
  assert.equal(run.state, 'completed');
  assert.equal(run.steps, 2);
  assert.equal(run.changedFiles.length, 2);
  assert.equal(run.validation.status, 'accepted');
  assert.equal(run.metrics.attempts, 2);
  assert.equal(checkpointStore.get(run.runId).state, 'completed');
});

test('runtime: pausa no boundary e retoma do próximo step', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { engine } = setup({ handler: async (input) => { await gate; return { capabilityId: definition.id, payload: input, evidence: [] }; } });
  const planned = await engine.start({ objective: 'pause', agent, budget, policy: allow });
  const executing = engine.execute(planned.runId);
  await new Promise((resolve) => setImmediate(resolve));
  engine.pause(planned.runId);
  release();
  const paused = await executing;
  assert.equal(paused.state, 'paused');
  const resumed = await engine.resume(paused.runId);
  assert.equal(resumed.state, 'completed');
  assert.equal(resumed.steps, 2);
});

test('runtime: Policy Engine default deny bloqueia antes do handler', async () => {
  let called = false;
  const { engine } = setup({ handler: () => { called = true; return { capabilityId: definition.id, payload: '', evidence: [] }; } });
  const run = await startAndExecute(engine, new PolicyEngine());
  assert.equal(run.state, 'blocked');
  assert.equal(run.error.code, 'POLICY_DENIED');
  assert.equal(called, false);
});

test('runtime: bloqueia orçamento antes de executar capability', async () => {
  let called = false;
  const { engine } = setup({ handler: () => { called = true; return { capabilityId: definition.id, payload: '', evidence: [] }; } });
  const run = await startAndExecute(engine, allow, { inputTokens: 2, outputTokens: 3, totalTokens: 5, usedTokens: 0 });
  assert.equal(run.state, 'blocked');
  assert.equal(run.error.code, 'TOKEN_BUDGET_EXCEEDED');
  assert.equal(called, false);
});

test('runtime: retry limitado permite recuperação determinística', async () => {
  let attempts = 0;
  const { engine } = setup({ handler: (input) => { attempts += 1; if (attempts === 1) throw new Error('transient'); return { capabilityId: definition.id, payload: input, evidence: [] }; }, planner: { plan: () => [{ capabilityId: definition.id, payload: 'once', estimatedTokens: 1 }] } });
  const run = await startAndExecute(engine);
  assert.equal(run.state, 'completed');
  assert.equal(attempts, 2);
  assert.equal(run.metrics.retries, 1);
});

test('runtime: validator recebe somente o resultado final após retry', async () => {
  let attempts = 0;
  let finalResults;
  const { engine } = setup({
    handler: (input) => {
      attempts += 1;
      if (attempts === 1) throw new Error('transient');
      return { capabilityId: definition.id, payload: input, evidence: [] };
    },
    planner: { plan: () => [{ capabilityId: definition.id, payload: 'once', estimatedTokens: 1 }] },
    validator: { validate: (_run, results) => { finalResults = results; return evaluation(); } },
  });
  const run = await startAndExecute(engine);
  assert.equal(run.state, 'completed');
  assert.equal(run.metrics.attempts, 2);
  assert.equal(finalResults.length, 1);
  assert.equal(finalResults[0].status, 'succeeded');
  assert.equal(finalResults[0].operationId, `${run.runId}:0`);
});

test('runtime: evidência contraditória não pode ser aceita pelo validator', async () => {
  let validations = 0;
  const { engine } = setup({
    handler: (input) => ({ capabilityId: definition.id, payload: input, evidence: [{ id: 'contradicted', source: 'test', locator: 'check', capturedAt: now, status: 'contradicted' }] }),
    validator: { validate: () => { validations += 1; return evaluation('accepted'); } },
  });
  const run = await startAndExecute(engine);
  assert.equal(run.state, 'failed');
  assert.equal(run.validation.status, 'rejected');
  assert.equal(validations, 0);
});

test('runtime: steps idênticos exigem aprovações distintas e preservam tentativas', async () => {
  const policy = new PolicyEngine({ rules: [{ id: 'review', priority: 1, effect: 'REQUIRE_APPROVAL', reason: 'Review each step', scope: {} }] });
  let calls = 0;
  let history;
  const registry = new CapabilityRegistry();
  registry.register({ definition, validateInput: (value) => value, validateOutput: (value) => value, handler: (input) => { calls += 1; return { capabilityId: definition.id, payload: input, evidence: [] }; } });
  const step = { capabilityId: definition.id, payload: 'same', estimatedTokens: 1, approval: { action: 'echo', justification: 'test', impact: 'test', expiresAt: '2099-01-01T00:00:00.000Z' } };
  const engine = new RuntimeEngine({
    registry,
    planner: { plan: () => [step, step] },
    validator: { validate: (_run, results) => { assert.equal(results.length, 2); assert.ok(results.every((result) => result.status === 'succeeded')); return evaluation(); } },
    persistence: { ...runtimePersistence(), saveResults(_id, results) { history = [...results]; } },
  });
  const run = await engine.start({ objective: 'two approvals', agent, policy, budget });
  assert.equal((await engine.execute(run.runId)).state, 'awaiting_approval');
  assert.equal(calls, 0);
  const first = policy.approvals.list()[0];
  policy.approvals.decide(first.id, { decision: 'approved', approverId: 'human', decidedAt: now });
  assert.equal((await engine.resume(run.runId)).state, 'awaiting_approval');
  assert.equal(calls, 1);
  const second = policy.approvals.list().find((approval) => approval.id !== first.id);
  assert.equal(first.operationId, `${run.runId}:0`);
  assert.equal(second.operationId, `${run.runId}:1`);
  policy.approvals.decide(second.id, { decision: 'approved', approverId: 'human', decidedAt: now });
  assert.equal((await engine.resume(run.runId)).state, 'completed');
  assert.equal(calls, 2);
  assert.deepEqual(history.map((result) => result.status), ['blocked', 'succeeded', 'blocked', 'succeeded']);
});

for (const [name, payload] of [['undefined em objeto', { optional: undefined }], ['undefined em array', [undefined]], ['zero negativo', { value: -0 }]]) {
  test(`runtime: plano persistido recusa ${name} antes de solicitar aprovação`, async () => {
    const database = new Database(':memory:');
    try {
      new SqliteMigrationRunner(database).apply();
      const persistence = new SqliteRuntimePersistence(database);
      const policy = new PolicyEngine({ rules: [{ id: 'review', priority: 1, effect: 'REQUIRE_APPROVAL', reason: 'Review', scope: {} }] });
      const registry = new CapabilityRegistry();
      registry.register({ definition, validateInput: (input) => ({ present: Object.hasOwn(input, 'optional') }), validateOutput: (output) => output, handler() { assert.fail('Payload alterável pela persistência não deve executar'); } });
      const engine = new RuntimeEngine({ registry, persistence, planner: { plan: () => [{ capabilityId: definition.id, payload, estimatedTokens: 1 }] }, validator: { validate: () => evaluation() } });
      const run = await engine.start({ objective: 'roundtrip', agent, budget, policy });
      assert.equal(run.state, 'failed');
      assert.equal(run.error.code, 'PLANNING_FAILED');
      assert.equal(policy.approvals.list().length, 0);
      assert.equal(persistence.getPlan(run.runId), undefined);
    } finally {
      database.close();
    }
  });
}

test('runtime: histórico sem vínculo de step não sustenta aceite após recuperação', async () => {
  const data = {};
  const persistence = {
    saveRun(run) { data.run = run; }, getRun() { return data.run; },
    savePlan(_id, plan) { data.plan = plan; }, getPlan() { return data.plan; },
    saveResults(_id, results) { data.results = results; }, getResults() { return data.results; },
    saveCursor(_id, nextStep, startedAt) { data.cursor = { nextStep, startedAt }; }, getCursor() { return data.cursor; },
  };
  const registry = new CapabilityRegistry();
  registry.register({ definition, validateInput: (value) => value, validateOutput: (value) => value, handler: (input) => ({ capabilityId: definition.id, payload: input, evidence: [] }) });
  const deps = { registry, persistence, planner: { plan: () => [{ capabilityId: definition.id, payload: 'legacy', estimatedTokens: 1 }] }, validator: { validate: () => evaluation() } };
  const first = new RuntimeEngine(deps);
  const run = await first.start({ objective: 'historical results', agent, policy: allow, budget });
  await first.execute(run.runId);
  data.run = { ...data.run, state: 'paused' };
  data.results = data.results.map((result) => { const legacy = { ...result }; delete legacy.operationId; return legacy; });
  const recovered = new RuntimeEngine({ ...deps, validator: { validate() { assert.fail('Histórico sem associação não deve chegar ao aceite'); } } });
  const result = await recovered.resume(run.runId, allow);
  assert.equal(result.state, 'failed');
  assert.equal(result.validation.status, 'inconclusive');
});

test('runtime: validator rejeita falsa conclusão', async () => {
  const { engine } = setup({ validator: { validate: () => evaluation('rejected') } });
  const run = await startAndExecute(engine);
  assert.equal(run.state, 'failed');
  assert.equal(run.validation.status, 'rejected');
});

test('runtime: recupera execução pausada após reinício usando SQLite', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-runtime-'));
  const dbPath = path.join(dir, 'runtime.db');
  const firstDatabase = new Database(dbPath);
  new SqliteMigrationRunner(firstDatabase).apply();
  const firstPersistence = new SqliteRuntimePersistence(firstDatabase);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const makeEngine = (persistence, handler) => {
    const registry = new CapabilityRegistry();
    registry.register({ definition, validateInput: (input) => input, validateOutput: (output) => output, handler });
    return new RuntimeEngine({
      registry,
      persistence,
      planner: { plan: () => [{ capabilityId: definition.id, payload: 'one', estimatedTokens: 10 }, { capabilityId: definition.id, payload: 'two', estimatedTokens: 10 }] },
      validator: { validate: () => evaluation() },
    });
  };
  const firstEngine = makeEngine(firstPersistence, async (input) => { await gate; return { capabilityId: definition.id, payload: input, evidence: [{ id: 'evidence-1', source: 'test', locator: 'runtime', capturedAt: now, status: 'verified' }] }; });
  const planned = await firstEngine.start({ objective: 'restart recovery', agent, budget, policy: allow });
  const executing = firstEngine.execute(planned.runId);
  await new Promise((resolve) => setImmediate(resolve));
  firstEngine.pause(planned.runId);
  release();
  const paused = await executing;
  assert.equal(paused.state, 'paused');
  assert.equal(paused.steps, 1);
  firstDatabase.close();

  const secondDatabase = new Database(dbPath);
  new SqliteMigrationRunner(secondDatabase).apply();
  const secondEngine = makeEngine(new SqliteRuntimePersistence(secondDatabase), (input) => ({ capabilityId: definition.id, payload: input, evidence: [{ id: 'evidence-2', source: 'test', locator: 'runtime', capturedAt: now, status: 'verified' }] }));
  const resumed = await secondEngine.resume(planned.runId, allow);

  assert.equal(resumed.state, 'completed');
  assert.equal(resumed.steps, 2);
  assert.equal(resumed.evidence.length, 2);
  assert.equal(resumed.metrics.attempts, 2);
  secondDatabase.close();
});
