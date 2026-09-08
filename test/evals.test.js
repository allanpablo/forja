import assert from 'node:assert/strict';
import test from 'node:test';
import { EvaluationEngine } from '../packages/evals/src/index.ts';

const observation = (id, inputHash, outcome = 'succeeded', contextRefs = ['ctx']) => ({ schemaVersion: '2.0', id, createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z', correlationId: id, traceId: id, taskId: 'task-1', inputHash, contextRefs, inputTokens: 4, outputTokens: 2, durationMs: 10, tools: [], files: [], commands: [], outcome });

test('evaluation computes deterministic quality and economy metrics', async () => {
  const engine = new EvaluationEngine({ list: () => [observation('a', 'hash-a'), observation('b', 'hash-a', 'failed'), observation('c', undefined, 'succeeded', [])] });
  const report = await engine.evaluate({ scope: 'task', scopeId: 'task-1' });
  assert.equal(report.metrics.observationCount, 3);
  assert.equal(report.metrics.reworkRate, 1 / 3);
  assert.equal(report.metrics.cacheHitRate, 1 / 3);
  assert.equal(report.metrics.assertionsWithoutEvidenceRate, 1 / 3);
  assert.equal(report.metrics.tokensPerTask, 18);
  assert.equal(report.observationIds.length, 3);
});

test('evaluation scope filters observations', async () => {
  const values = [observation('a', 'one'), { ...observation('b', 'two'), taskId: 'task-2' }];
  const report = await new EvaluationEngine({ list: () => values }).evaluate({ scope: 'task', scopeId: 'task-2' });
  assert.deepEqual(report.observationIds, ['b']);
});

test('SPEC-049: metrics inclui p50/p95 de latência e custo por tarefa aceita', async () => {
  const obs = (id, durationMs, cost, validationStatus) => ({
    schemaVersion: '2.0', id, createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z',
    correlationId: id, traceId: id, taskId: 'task-1', inputHash: id, contextRefs: ['ctx'],
    inputTokens: 4, outputTokens: 2, durationMs, cost, tools: [], files: [], commands: [],
    outcome: 'succeeded', validationStatus,
  });
  const engine = new EvaluationEngine({ list: () => [
    obs('a', 100, 0.01, 'accepted'), obs('b', 200, 0.02, 'accepted'),
    obs('c', 300, 0.03, 'rejected'), obs('d', 400, 0.04, 'rejected'),
  ] });
  const m = (await engine.evaluate({ scope: 'workspace' })).metrics;
  assert.equal(m.durationMsP50, 250);                   // interpolação linear entre 200 e 300
  assert.equal(Math.round(m.durationMsP95), 385);
  assert.equal(Math.round(m.costPerAcceptedTask * 10000) / 10000, 0.05);  // 0.10 total / 2 aceitas
});

test('SPEC-049: costPerAcceptedTask é 0 quando nenhuma tarefa foi aceita', async () => {
  const obs = { schemaVersion: '2.0', id: 'x', createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z', correlationId: 'x', traceId: 'x', taskId: 't', inputHash: 'x', contextRefs: [], inputTokens: 1, outputTokens: 1, durationMs: 50, cost: 0.9, tools: [], files: [], commands: [], outcome: 'succeeded', validationStatus: 'rejected' };
  const m = (await new EvaluationEngine({ list: () => [obs] }).evaluate({ scope: 'workspace' })).metrics;
  assert.equal(m.costPerAcceptedTask, 0);
});
