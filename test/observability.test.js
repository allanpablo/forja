import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ControlPlane, ObservabilityError, ObservabilityRecorder } from '../packages/observability/src/index.ts';

test('observability: registra campos auditáveis e calcula métricas por run', async () => {
  const recorder = new ObservabilityRecorder();
  await recorder.record({ traceId: 'trace-1', runId: 'run-1', agentId: 'agent-1', taskId: 'task-1', sprintId: 'sprint-1', capabilityId: 'forja.test.capability', contextRefs: ['context-1'], inputTokens: 10, outputTokens: 5, durationMs: 20, tools: ['test'], files: ['src/a.ts'], commands: ['npm test'], outcome: 'succeeded', evidenceIds: ['e-1'] });
  await recorder.record({ traceId: 'trace-2', runId: 'run-2', inputTokens: 4, outputTokens: 1, durationMs: 5, outcome: 'blocked' });
  const metrics = await recorder.metrics();
  assert.equal(metrics.observationCount, 2);
  assert.equal(metrics.runCount, 2);
  assert.equal(metrics.successRate, 0.5);
  assert.equal(metrics.blockedRuns, 1);
  assert.equal(metrics.totalInputTokens, 14);
  assert.equal(metrics.evidenceCoverageRate, 0.5);
});

test('observability: Control Plane expõe métricas e rejeita trace vazio', async () => {
  const controlPlane = new ControlPlane();
  await assert.rejects(() => controlPlane.record({ traceId: '', outcome: 'failed' }), ObservabilityError);
  const metrics = await controlPlane.metrics();
  assert.equal(metrics.observationCount, 0);
  assert.deepEqual(await controlPlane.observations(), []);
});

test('observability: publicação de observação gera evento SSE por sink', async () => {
  const events = [];
  const controlPlane = new ControlPlane(undefined, { events: { publish: (event) => events.push(event) } });
  await controlPlane.record({ traceId: 'trace-event', outcome: 'succeeded' });
  assert.equal(events[0].type, 'observation.recorded');
  assert.equal(events[0].aggregateId, 'trace-event');
});

test('observability: operações delegadas pelo Control Plane deixam observação de sucesso/falha', async () => {
  const controlPlane = new ControlPlane(undefined, { runtime: { start: () => ({ runId: 'run-1', state: 'created' }), get: () => ({}), execute: () => ({}), pause: () => ({}), resume: () => ({}), cancel: () => ({}) } });
  await controlPlane.runtimeStart({ objective: 'test' });
  const observations = await controlPlane.observations();
  assert.equal(observations.length, 1);
  assert.equal(observations[0].runId, 'run-1');
  assert.equal(observations[0].outcome, 'succeeded');
});
