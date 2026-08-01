import { randomUUID } from 'node:crypto';
import { CONTRACT_VERSION, type CapabilityId, type ControlPlaneMetrics, type EntityId, type ISO8601, type Observation, type RunId } from '../../contracts/src/index.ts';

export interface ObservationInput {
  readonly traceId: string;
  readonly runId?: RunId;
  readonly agentId?: EntityId;
  readonly taskId?: EntityId;
  readonly sprintId?: EntityId;
  readonly capabilityId?: CapabilityId;
  readonly model?: string;
  readonly inputHash?: string;
  readonly contextRefs?: readonly string[];
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly durationMs?: number;
  readonly cost?: number;
  readonly tools?: readonly string[];
  readonly files?: readonly string[];
  readonly commands?: readonly string[];
  readonly validationStatus?: Observation['validationStatus'];
  readonly outcome: Observation['outcome'];
  readonly errorCode?: string;
  readonly evidenceIds?: readonly EntityId[];
  readonly correlationId?: string;
}

export interface ObservationStore {
  append(value: Observation): void | Promise<void>;
  list(): readonly Observation[] | Promise<readonly Observation[]>;
}

export interface ControlPlanePort {
  metrics(): ControlPlaneMetrics | Promise<ControlPlaneMetrics>;
  observations(): readonly Observation[] | Promise<readonly Observation[]>;
  runtimeStart?(input: unknown): unknown | Promise<unknown>;
  runtimeGet?(id: string): unknown | Promise<unknown>;
  runtimeExecute?(id: string): unknown | Promise<unknown>;
  runtimePause?(id: string): unknown | Promise<unknown>;
  runtimeResume?(id: string): unknown | Promise<unknown>;
  runtimeCancel?(id: string): unknown | Promise<unknown>;
  sprintCreate?(input: unknown): unknown | Promise<unknown>;
  sprintStart?(id: string): unknown | Promise<unknown>;
  sprintPause?(id: string): unknown | Promise<unknown>;
  taskCreate?(input: unknown): unknown | Promise<unknown>;
  taskStart?(id: string): unknown | Promise<unknown>;
  taskBlock?(id: string): unknown | Promise<unknown>;
  handoffCreate?(input: unknown): unknown | Promise<unknown>;
  approvalGet?(id: string): unknown | Promise<unknown>;
  approvalList?(): unknown | Promise<unknown>;
  approvalDecide?(id: string, input: unknown): unknown | Promise<unknown>;
}

export interface ControlPlaneEvent {
  readonly id: string;
  readonly type: string;
  readonly aggregateId: string;
  readonly data: unknown;
  readonly correlationId: string;
}

export interface ControlPlaneEventSink { publish(event: ControlPlaneEvent): void; }

export interface ControlPlaneServices {
  readonly runtime?: { readonly start: (input: unknown) => unknown | Promise<unknown>; readonly get: (input: unknown) => unknown | Promise<unknown>; readonly execute: (input: unknown) => unknown | Promise<unknown>; readonly pause: (input: unknown) => unknown | Promise<unknown>; readonly resume: (input: unknown) => unknown | Promise<unknown>; readonly cancel: (input: unknown) => unknown | Promise<unknown> };
  readonly sprint?: { readonly create: (input: unknown) => unknown | Promise<unknown>; readonly start: (input: unknown) => unknown | Promise<unknown>; readonly pause: (input: unknown) => unknown | Promise<unknown> };
  readonly task?: { readonly create: (input: unknown) => unknown | Promise<unknown>; readonly start: (input: unknown) => unknown | Promise<unknown>; readonly block: (input: unknown) => unknown | Promise<unknown> };
  readonly handoff?: { readonly create: (input: unknown) => unknown | Promise<unknown> };
  readonly approvals?: { readonly get: (input: unknown) => unknown | Promise<unknown>; readonly list?: (input: unknown) => unknown | Promise<unknown>; readonly decide: (input: unknown) => unknown | Promise<unknown> };
  readonly events?: ControlPlaneEventSink;
}

export class ObservabilityError extends Error {
  constructor(message: string) { super(message); this.name = 'ObservabilityError'; }
}

export class InMemoryObservationStore implements ObservationStore {
  private readonly values: Observation[] = [];
  append(value: Observation): void { this.values.push(value); }
  list(): readonly Observation[] { return [...this.values]; }
}

export class ObservabilityRecorder {
  private readonly store: ObservationStore;
  constructor(store: ObservationStore = new InMemoryObservationStore()) { this.store = store; }

  async record(input: ObservationInput): Promise<Observation> {
    if (input.traceId.trim().length === 0) throw new ObservabilityError('traceId is required');
    const observation: Observation = {
      schemaVersion: CONTRACT_VERSION, id: randomUUID() as EntityId, createdAt: new Date().toISOString() as ISO8601, updatedAt: new Date().toISOString() as ISO8601, correlationId: input.correlationId ?? input.traceId,
      traceId: input.traceId, runId: input.runId, agentId: input.agentId, taskId: input.taskId, sprintId: input.sprintId, capabilityId: input.capabilityId, model: input.model, inputHash: input.inputHash,
      contextRefs: this.clean(input.contextRefs), inputTokens: this.nonNegative(input.inputTokens ?? 0, 'inputTokens'), outputTokens: this.nonNegative(input.outputTokens ?? 0, 'outputTokens'), durationMs: this.nonNegative(input.durationMs ?? 0, 'durationMs'), cost: this.nonNegative(input.cost ?? 0, 'cost'), tools: this.clean(input.tools), files: this.clean(input.files), commands: this.clean(input.commands), validationStatus: input.validationStatus, outcome: input.outcome, errorCode: input.errorCode,
    };
    await this.store.append(observation); return observation;
  }

  async metrics(): Promise<ControlPlaneMetrics> { return this.calculate(await this.store.list()); }
  async observations(): Promise<readonly Observation[]> { return this.store.list(); }

  private calculate(values: readonly Observation[]): ControlPlaneMetrics {
    const runOutcomes = new Map<RunId, Observation['outcome']>();
    for (const value of values) if (value.runId !== undefined) runOutcomes.set(value.runId, value.outcome);
    const runs = [...runOutcomes.values()];
    const successfulRuns = runs.filter((outcome) => outcome === 'succeeded').length;
    const failedRuns = runs.filter((outcome) => outcome === 'failed').length;
    const blockedRuns = runs.filter((outcome) => outcome === 'blocked').length;
    const evidenceCount = values.filter((value) => value.contextRefs.length > 0 || value.inputHash !== undefined).length;
    return { observationCount: values.length, runCount: runs.length, successfulRuns, failedRuns, blockedRuns, successRate: runs.length === 0 ? 0 : successfulRuns / runs.length, totalInputTokens: values.reduce((sum, value) => sum + value.inputTokens, 0), totalOutputTokens: values.reduce((sum, value) => sum + value.outputTokens, 0), totalDurationMs: values.reduce((sum, value) => sum + value.durationMs, 0), totalCost: values.reduce((sum, value) => sum + (value.cost ?? 0), 0), evidenceCoverageRate: values.length === 0 ? 0 : evidenceCount / values.length };
  }

  private clean(values: readonly string[] | undefined): readonly string[] { return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]; }
  private nonNegative(value: number, field: string): number { if (!Number.isFinite(value) || value < 0) throw new ObservabilityError(`${field} must be non-negative`); return value; }
}

export class ControlPlane implements ControlPlanePort {
  private readonly recorder: ObservabilityRecorder;
  private readonly services: ControlPlaneServices;
  constructor(recorder: ObservabilityRecorder = new ObservabilityRecorder(), services: ControlPlaneServices = {}) { this.recorder = recorder; this.services = services; }
  metrics(): Promise<ControlPlaneMetrics> { return this.recorder.metrics(); }
  observations(): Promise<readonly Observation[]> { return this.recorder.observations(); }
  async record(input: ObservationInput): Promise<Observation> { const observation = await this.recorder.record(input); this.services.events?.publish({ id: observation.id, type: 'observation.recorded', aggregateId: observation.runId ?? observation.traceId, data: observation, correlationId: observation.correlationId }); return observation; }
  runtimeStart(input: unknown): Promise<unknown> { return this.delegate(this.services.runtime?.start, input, 'runtimeStart'); }
  runtimeGet(id: string): Promise<unknown> { return this.delegate(this.services.runtime?.get, id, 'runtimeGet'); }
  runtimeExecute(id: string): Promise<unknown> { return this.delegate(this.services.runtime?.execute, id, 'runtimeExecute'); }
  runtimePause(id: string): Promise<unknown> { return this.delegate(this.services.runtime?.pause, id, 'runtimePause'); }
  runtimeResume(id: string): Promise<unknown> { return this.delegate(this.services.runtime?.resume, id, 'runtimeResume'); }
  runtimeCancel(id: string): Promise<unknown> { return this.delegate(this.services.runtime?.cancel, id, 'runtimeCancel'); }
  sprintCreate(input: unknown): Promise<unknown> { return this.delegate(this.services.sprint?.create, input, 'sprintCreate'); }
  sprintStart(id: string): Promise<unknown> { return this.delegate(this.services.sprint?.start, id, 'sprintStart'); }
  sprintPause(id: string): Promise<unknown> { return this.delegate(this.services.sprint?.pause, id, 'sprintPause'); }
  taskCreate(input: unknown): Promise<unknown> { return this.delegate(this.services.task?.create, input, 'taskCreate'); }
  taskStart(id: string): Promise<unknown> { return this.delegate(this.services.task?.start, id, 'taskStart'); }
  taskBlock(id: string): Promise<unknown> { return this.delegate(this.services.task?.block, id, 'taskBlock'); }
  handoffCreate(input: unknown): Promise<unknown> { return this.delegate(this.services.handoff?.create, input, 'handoffCreate'); }
  approvalGet(id: string): Promise<unknown> { return this.delegate(this.services.approvals?.get, id, 'approvalGet'); }
  approvalList(): Promise<unknown> { return this.delegate(this.services.approvals?.list, 'all', 'approvalList'); }
  approvalDecide(id: string, input: unknown): Promise<unknown> { return this.delegate(this.services.approvals?.decide, { id, input }, 'approvalDecide'); }
  private async delegate(handler: ((input: unknown) => unknown | Promise<unknown>) | undefined, input: unknown, name: string): Promise<unknown> {
    if (handler === undefined) throw new ObservabilityError(`Control Plane service is not configured: ${name}`);
    const traceId = `control-plane:${name}:${typeof input === 'string' ? input : name}`;
    try {
      const result = await handler(input);
      await this.record({ traceId, runId: this.runId(result), outcome: this.outcome(result), inputTokens: 0, outputTokens: 0, durationMs: 0 });
      return result;
    } catch (error: unknown) {
      await this.record({ traceId, outcome: 'failed', errorCode: error instanceof Error ? error.name : 'UNKNOWN', inputTokens: 0, outputTokens: 0, durationMs: 0 });
      throw error;
    }
  }
  private runId(value: unknown): RunId | undefined { return isRecord(value) && typeof value.runId === 'string' ? value.runId as RunId : undefined; }
  private outcome(value: unknown): Observation['outcome'] { if (!isRecord(value)) return 'succeeded'; if (value.state === 'blocked' || value.status === 'blocked') return 'blocked'; if (value.state === 'failed' || value.status === 'failed') return 'failed'; return 'succeeded'; }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
