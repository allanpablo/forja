import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistry } from '../packages/core/src/index.ts';
import { PolicyEngine } from '../packages/policy/src/index.ts';
import { InMemoryCheckpointStore, RuntimeEngine } from '../packages/runtime/src/index.ts';

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

function setup({ handler = (input) => ({ capabilityId: definition.id, payload: input, evidence: [] }), planner, validator = { validate: () => evaluation() }, policy = allow, checkpointStore = new InMemoryCheckpointStore() } = {}) {
  const registry = new CapabilityRegistry();
  registry.register({ definition, validateInput: (input) => input, validateOutput: (output) => output, handler });
  const engine = new RuntimeEngine({ registry, planner: planner ?? { plan: () => [{ capabilityId: definition.id, payload: 'one', estimatedTokens: 10, files: ['src/a.ts'] }, { capabilityId: definition.id, payload: 'two', estimatedTokens: 10, files: ['src/b.ts'] }] }, validator, checkpointStore });
  return { engine, checkpointStore, policy };
}

async function startAndExecute(engine, policy = allow, budgetOverride = budget) {
  const run = await engine.start({ objective: 'test runtime', agent, budget: budgetOverride, policy });
  return engine.execute(run.runId);
}

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

test('runtime: validator rejeita falsa conclusão', async () => {
  const { engine } = setup({ validator: { validate: () => evaluation('rejected') } });
  const run = await startAndExecute(engine);
  assert.equal(run.state, 'failed');
  assert.equal(run.validation.status, 'rejected');
});
