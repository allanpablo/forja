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
