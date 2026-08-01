import type { ControlPlaneMetrics, Observation } from '../../../packages/contracts/src/index.ts';
import type { ControlPlanePort } from '../../../packages/observability/src/index.ts';

export interface DashboardSnapshot {
  readonly metrics: ControlPlaneMetrics;
  readonly observations: readonly Observation[];
  readonly generatedAt: string;
}

export interface DashboardActions {
  readonly pauseRuntime: (runId: string) => Promise<unknown>;
  readonly cancelRuntime: (runId: string) => Promise<unknown>;
  readonly approve: (requestId: string, input: unknown) => Promise<unknown>;
}

export async function loadDashboardSnapshot(controlPlane: ControlPlanePort): Promise<DashboardSnapshot> {
  const [metrics, observations] = await Promise.all([controlPlane.metrics(), controlPlane.observations()]);
  return { metrics, observations, generatedAt: new Date().toISOString() };
}

export function dashboardActions(controlPlane: ControlPlanePort): DashboardActions {
  return {
    pauseRuntime: async (runId) => requireService(controlPlane.runtimePause, 'runtimePause')(runId),
    cancelRuntime: async (runId) => requireService(controlPlane.runtimeCancel, 'runtimeCancel')(runId),
    approve: async (requestId, input) => requireService(controlPlane.approvalDecide, 'approvalDecide')(requestId, input),
  };
}

function requireService<T extends (...args: never[]) => unknown>(service: T | undefined, name: string): T {
  if (service === undefined) throw new Error(`Dashboard service is not configured: ${name}`);
  return service;
}
