import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardActions, loadDashboardSnapshot } from '../apps/dashboard/src/index.ts';
import { createWorkerRuntime } from '../apps/worker/src/main.ts';

test('dashboard view model reads control plane and delegates critical actions', async () => {
  const calls = [];
  const controlPlane = { metrics: () => ({ observationCount: 0 }), observations: () => [], runtimePause: (id) => { calls.push(`pause:${id}`); return { id }; }, runtimeCancel: (id) => { calls.push(`cancel:${id}`); return { id }; }, approvalDecide: (id) => { calls.push(`approve:${id}`); return { id }; } };
  const snapshot = await loadDashboardSnapshot(controlPlane);
  assert.equal(snapshot.metrics.observationCount, 0);
  await dashboardActions(controlPlane).pauseRuntime('run-1');
  await dashboardActions(controlPlane).cancelRuntime('run-1');
  assert.deepEqual(calls, ['pause:run-1', 'cancel:run-1']);
});

test('worker composes event bus, scheduler and deterministic evaluator', () => {
  const worker = createWorkerRuntime();
  assert.equal(worker.scheduler.list().length, 0);
  assert.equal(worker.evaluations !== undefined, true);
  assert.equal(worker.events !== undefined, true);
});
