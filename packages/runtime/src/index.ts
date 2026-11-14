import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  CONTRACT_VERSION,
  type AgentIdentity,
  type Checkpoint,
  type EntityId,
  type EvaluationResult,
  type ExecutionError,
  type ExecutionResult,
  type Evidence,
  type ISO8601,
  type PolicyDecision,
  type RuntimeMetrics,
  type RuntimeRun,
  type RunId,
  type TokenBudget,
  validateTokenBudget,
} from '../../contracts/src/index.ts';
import type { CapabilityExecutionRequest, CapabilityRegistry } from '../../core/src/index.ts';

export interface RuntimeLimits {
  readonly maxSteps: number;
  readonly maxTokens: number;
  readonly maxFiles: number;
  readonly maxDurationMs: number;
  readonly maxRetries: number;
  readonly maxParallel: number;
}

export interface RuntimePlanStep {
  readonly capabilityId: string;
  readonly payload: unknown;
  readonly estimatedTokens: number;
  readonly files?: readonly string[];
  readonly projectId?: string;
  readonly environment?: string;
  readonly categories?: readonly string[];
  readonly approval?: CapabilityExecutionRequest['approval'];
}

export interface RuntimePlanner {
  plan(objective: string, context: unknown): readonly RuntimePlanStep[] | Promise<readonly RuntimePlanStep[]>;
}

export interface RuntimeValidator {
  validate(run: RuntimeRun, results: readonly ExecutionResult[]): EvaluationResult | Promise<EvaluationResult>;
}

export interface RuntimeContextBuilder {
  build(objective: string): unknown | Promise<unknown>;
}

export interface CheckpointStore {
  save(checkpoint: Checkpoint): void | Promise<void>;
  get(runId: RunId): Checkpoint | undefined | Promise<Checkpoint | undefined>;
}

export interface RuntimePersistence {
  saveRun(run: RuntimeRun): void | Promise<void>;
  getRun(runId: RunId): RuntimeRun | undefined | Promise<RuntimeRun | undefined>;
  savePlan(runId: RunId, plan: readonly RuntimePlanStep[]): void | Promise<void>;
  getPlan(runId: RunId): readonly RuntimePlanStep[] | undefined | Promise<readonly RuntimePlanStep[] | undefined>;
  saveResults(runId: RunId, results: readonly ExecutionResult[]): void | Promise<void>;
  getResults(runId: RunId): readonly ExecutionResult[] | undefined | Promise<readonly ExecutionResult[] | undefined>;
  saveCursor(runId: RunId, nextStep: number, startedAt: number): void | Promise<void>;
  getCursor(runId: RunId): { readonly nextStep: number; readonly startedAt: number } | undefined | Promise<{ readonly nextStep: number; readonly startedAt: number } | undefined>;
}

export interface RuntimeMemory {
  remember(run: RuntimeRun, result: ExecutionResult): void | Promise<void>;
}

export interface RuntimeStartRequest {
  readonly runId?: RunId;
  readonly handoffId?: EntityId;
  readonly context?: unknown;
  readonly objective: string;
  readonly agent: AgentIdentity;
  readonly budget: TokenBudget;
  readonly policy: CapabilityExecutionRequest['policy'];
  readonly limits?: Partial<RuntimeLimits>;
  readonly sprintId?: EntityId;
  readonly taskId?: EntityId;
  readonly correlationId?: string;
}

export interface RuntimeDependencies {
  readonly registry: CapabilityRegistry;
  readonly planner: RuntimePlanner;
  readonly validator: RuntimeValidator;
  readonly contextBuilder?: RuntimeContextBuilder;
  readonly checkpointStore?: CheckpointStore;
  readonly persistence?: RuntimePersistence;
  readonly memory?: RuntimeMemory;
  readonly beforeExecution?: (run: RuntimeRun) => void | Promise<void>;
}

const DEFAULT_LIMITS: RuntimeLimits = {
  maxSteps: 20,
  maxTokens: 10000,
  maxFiles: 50,
  maxDurationMs: 300000,
  maxRetries: 2,
  maxParallel: 1,
};

export class RuntimeError extends Error {
  readonly code: string;

  constructor(message: string, code = 'RUNTIME_ERROR') {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
  }
}

export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly checkpoints = new Map<RunId, Checkpoint>();

  save(checkpoint: Checkpoint): void {
    this.checkpoints.set(checkpoint.runId, checkpoint);
  }

  get(runId: RunId): Checkpoint | undefined {
    return this.checkpoints.get(runId);
  }
}

export class RuntimeEngine {
  private readonly dependencies: RuntimeDependencies;
  private readonly limits: RuntimeLimits;
  private readonly runs = new Map<RunId, RuntimeRun>();
  private readonly plans = new Map<RunId, readonly RuntimePlanStep[]>();
  private readonly results = new Map<RunId, ExecutionResult[]>();
  private readonly nextSteps = new Map<RunId, number>();
  private readonly policies = new Map<RunId, CapabilityExecutionRequest['policy']>();
  private readonly requestedPauses = new Set<RunId>();
  private readonly startedAt = new Map<RunId, number>();
  private readonly starts = new Map<RunId, Promise<RuntimeRun>>();
  private readonly executions = new Map<RunId, Promise<RuntimeRun>>();
  private readonly recoveries = new Map<RunId, Promise<RuntimeRun>>();
  private readonly requestedCancels = new Set<RunId>();
  // An interrupted write leaves execution ambiguous; retrying must not replay effects.
  private readonly executionErrors = new Map<RunId, unknown>();

  constructor(dependencies: RuntimeDependencies, limits: Partial<RuntimeLimits> = {}) {
    this.dependencies = dependencies;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.validateLimits(this.limits);
  }

  start(request: RuntimeStartRequest): Promise<RuntimeRun> {
    const runId = request.runId ?? randomUUID() as RunId;
    if (this.has(runId) || this.starts.has(runId) || this.recoveries.has(runId)) {
      return Promise.reject(new RuntimeError(`Run already exists: ${runId}`, 'RUN_ID_COLLISION'));
    }
    const starting = Promise.resolve().then(async () => {
      validateTokenBudget(request.budget);
      if (request.objective.trim().length === 0) throw new RuntimeError('Runtime objective is required');
      if (await this.dependencies.persistence?.getRun(runId) !== undefined) {
        throw new RuntimeError(`Run already exists: ${runId}`, 'RUN_ID_COLLISION');
      }
      return this.prepare(runId, request);
    }).catch((error: unknown) => {
      if (this.has(runId)) this.executionErrors.set(runId, error);
      throw error;
    }).finally(() => { this.starts.delete(runId); });
    this.starts.set(runId, starting);
    return starting;
  }

  private async prepare(runId: RunId, request: RuntimeStartRequest): Promise<RuntimeRun> {
    const fields = this.auditFields(request.correlationId ?? runId);
    const run: RuntimeRun = {
      ...fields,
      runId,
      objective: request.objective,
      agent: request.agent,
      sprintId: request.sprintId,
      taskId: request.taskId,
      handoffId: request.handoffId,
      policy: { effect: 'ALLOW_WITH_LIMITS', reason: 'Policy is evaluated per capability', policyId: 'runtime-per-capability', limits: { maxTokens: this.limits.maxTokens, maxFiles: this.limits.maxFiles, maxRetries: this.limits.maxRetries } },
      budget: request.budget,
      state: 'created',
      steps: 0,
      evidence: [],
      changedFiles: [],
      metrics: { attempts: 0, retries: 0, durationMs: 0, inputTokens: 0, outputTokens: 0 },
    };
    this.runs.set(runId, run);
    this.results.set(runId, []);
    this.nextSteps.set(runId, 0);
    this.policies.set(runId, request.policy);
    this.startedAt.set(runId, Date.now());
    await this.dependencies.persistence?.saveRun(run);
    await this.dependencies.persistence?.saveCursor(runId, 0, this.startedAt.get(runId) as number);

    await this.update(runId, { state: 'planning' });
    let plan: RuntimePlanStep[];
    try {
      const context = Object.hasOwn(request, 'context') ? request.context : await this.dependencies.contextBuilder?.build(request.objective);
      plan = [...await this.dependencies.planner.plan(request.objective, context)];
      if (this.dependencies.persistence !== undefined) {
        // JSON persistence must not change the input bound to an approval on recovery.
        for (const step of plan) {
          if (step.payload !== undefined && !isDeepStrictEqual(step.payload, JSON.parse(JSON.stringify(step.payload)))) {
            throw new RuntimeError('Persisted step payload must round-trip through JSON without changes');
          }
        }
      }
    } catch (error: unknown) {
      return this.stop(runId, 'failed', this.error('PLANNING_FAILED', this.message(error), false));
    }
    if (this.requestedCancels.has(runId)) return this.stop(runId, 'cancelled');
    if (plan.length > this.limits.maxSteps) return this.stop(runId, 'blocked', this.error('MAX_STEPS_EXCEEDED', 'Plan exceeds maximum steps', false));
    await this.dependencies.persistence?.savePlan(runId, plan);
    this.plans.set(runId, plan);
    await this.saveCheckpoint(runId, 'planning', 0);
    return this.get(runId);
  }

  execute(runId: RunId): Promise<RuntimeRun> {
    return this.singleFlight(runId, async () => {
      await this.starts.get(runId);
      return this.executeRun(runId);
    });
  }

  private singleFlight(runId: RunId, work: () => Promise<RuntimeRun>): Promise<RuntimeRun> {
    const existing = this.executions.get(runId);
    if (existing !== undefined) return existing;
    if (this.executionErrors.has(runId)) return Promise.reject(this.executionErrors.get(runId));
    const executing = Promise.resolve().then(work).catch((error: unknown) => {
      if (this.has(runId) && !(error instanceof RuntimeError && error.code === 'RUN_NOT_RESUMABLE')) this.executionErrors.set(runId, error);
      throw error;
    }).finally(() => { this.executions.delete(runId); });
    this.executions.set(runId, executing);
    return executing;
  }

  private async executeRun(runId: RunId): Promise<RuntimeRun> {
    const current = this.get(runId);
    if (this.isTerminal(current.state)) return current;
    const plan = this.plans.get(runId);
    if (plan === undefined) return this.stop(runId, 'failed', this.error('PLAN_NOT_FOUND', 'Runtime plan is missing', false));
    await this.update(runId, { state: 'running' });
    await this.dependencies.beforeExecution?.(this.get(runId));

    while (true) {
      const run = this.get(runId);
      if (this.requestedCancels.has(runId)) return this.stop(runId, 'cancelled');
      if (this.requestedPauses.has(runId)) {
        this.requestedPauses.delete(runId);
        return this.stop(runId, 'paused');
      }
      if (run.state === 'cancelled') return run;
      const index = this.nextSteps.get(runId) ?? 0;
      if (index >= plan.length) return this.validateAndFinish(runId);
      if (run.steps >= this.limits.maxSteps) return this.stop(runId, 'blocked', this.error('MAX_STEPS_EXCEEDED', 'Runtime step limit reached', false));
      if (Date.now() - (this.startedAt.get(runId) ?? Date.now()) > this.limits.maxDurationMs) return this.stop(runId, 'blocked', this.error('MAX_DURATION_EXCEEDED', 'Runtime duration limit reached', false));

      const step = plan[index];
      const estimatedTokens = this.nonNegativeInteger(step.estimatedTokens, 'estimatedTokens');
      const files = [...new Set([...run.changedFiles, ...(step.files ?? [])])];
      if (files.length > this.limits.maxFiles) return this.stop(runId, 'blocked', this.error('MAX_FILES_EXCEEDED', 'Runtime file limit reached', false));

      let attempt = 0;
      let result: ExecutionResult;
      do {
        attempt += 1;
        const beforeAttempt = this.get(runId);
        const projectedTokens = beforeAttempt.budget.usedTokens + estimatedTokens;
        if (projectedTokens > beforeAttempt.budget.totalTokens || projectedTokens > this.limits.maxTokens) return this.stop(runId, 'blocked', this.error('TOKEN_BUDGET_EXCEEDED', 'Runtime token budget reached', false));
        await this.update(runId, { steps: beforeAttempt.steps + 1, budget: { ...beforeAttempt.budget, usedTokens: projectedTokens }, metrics: this.metrics(beforeAttempt, { attempts: beforeAttempt.metrics.attempts + 1, inputTokens: beforeAttempt.metrics.inputTokens + estimatedTokens }) });
        if (this.requestedCancels.has(runId)) return this.stop(runId, 'cancelled');
        result = await this.dependencies.registry.execute({
          input: { capabilityId: step.capabilityId as CapabilityExecutionRequest['input']['capabilityId'], payload: step.payload },
          agent: run.agent,
          policy: this.policies.get(runId) ?? (() => { throw new RuntimeError('Runtime policy is missing'); })(),
          correlationId: runId,
          operationId: `${runId}:${index}`,
          projectId: step.projectId,
          environment: step.environment,
          categories: step.categories,
          files: step.files,
          budget: beforeAttempt.budget,
          approval: step.approval,
        } as CapabilityExecutionRequest);
        this.results.get(runId)?.push(result);
        await this.dependencies.persistence?.saveResults(runId, this.results.get(runId) ?? []);
        if (this.requestedCancels.has(runId)) return this.stop(runId, 'cancelled');
        if (result.status === 'succeeded') break;
        if (!result.error?.retryable || attempt > this.limits.maxRetries) break;
        const afterAttempt = this.get(runId);
        await this.update(runId, { metrics: this.metrics(afterAttempt, { retries: afterAttempt.metrics.retries + 1 }) });
      } while (attempt <= this.limits.maxRetries);

      if (result.status !== 'succeeded') {
        const state = result.error?.code === 'APPROVAL_REQUIRED' ? 'awaiting_approval' : result.error?.code === 'POLICY_DENIED' ? 'blocked' : 'failed';
        return this.stop(runId, state, result.error);
      }
      await this.update(runId, { evidence: [...this.get(runId).evidence, ...result.evidence], changedFiles: files });
      await this.dependencies.memory?.remember(this.get(runId), result);
      await this.dependencies.persistence?.saveCursor(runId, index + 1, this.startedAt.get(runId) ?? Date.now());
      this.nextSteps.set(runId, index + 1);
      await this.saveCheckpoint(runId, 'running', index + 1);
    }
  }

  recover(runId: RunId, policy: CapabilityExecutionRequest['policy']): Promise<RuntimeRun> {
    const starting = this.starts.get(runId);
    if (starting !== undefined) return starting;
    if (this.has(runId)) return Promise.resolve(this.get(runId));
    const existing = this.recoveries.get(runId);
    if (existing !== undefined) return existing;
    const recovering = this.load(runId, policy).finally(() => { this.recoveries.delete(runId); });
    this.recoveries.set(runId, recovering);
    return recovering;
  }

  private async load(runId: RunId, policy: CapabilityExecutionRequest['policy']): Promise<RuntimeRun> {
    const persistence = this.dependencies.persistence;
    if (persistence === undefined) throw new RuntimeError('Runtime persistence is not configured');
    const run = await persistence.getRun(runId);
    if (run === undefined) throw new RuntimeError(`Run not found: ${runId}`, 'RUN_NOT_FOUND');
    if (this.isTerminal(run.state)) {
      if (this.has(runId)) return this.get(runId);
      this.runs.set(runId, run);
      return run;
    }
    const plan = await persistence.getPlan(runId);
    const results = await persistence.getResults(runId);
    const cursor = await persistence.getCursor(runId);
    if (this.has(runId)) return this.get(runId);
    if (plan === undefined || cursor === undefined || !Number.isInteger(cursor.nextStep) || cursor.nextStep < 0 || cursor.nextStep > plan.length || !Number.isFinite(cursor.startedAt)) {
      throw new RuntimeError(`Persisted runtime is incomplete: ${runId}`, 'RECOVERY_INCOMPLETE');
    }
    this.runs.set(runId, run);
    this.plans.set(runId, plan);
    this.results.set(runId, [...(results ?? [])]);
    this.nextSteps.set(runId, cursor.nextStep);
    this.policies.set(runId, policy);
    this.startedAt.set(runId, cursor.startedAt);
    return run;
  }

  resume(runId: RunId, policy?: CapabilityExecutionRequest['policy']): Promise<RuntimeRun> {
    return this.singleFlight(runId, async () => {
      await this.starts.get(runId);
      if (!this.has(runId) && policy !== undefined) await this.recover(runId, policy);
      const run = this.get(runId);
      if (run.state !== 'paused' && run.state !== 'awaiting_approval') throw new RuntimeError(`Run is not resumable: ${run.state}`, 'RUN_NOT_RESUMABLE');
      return this.executeRun(runId);
    });
  }

  pause(runId: RunId): RuntimeRun {
    const run = this.get(runId);
    if (run.state === 'running') this.requestedPauses.add(runId);
    return run;
  }

  cancel(runId: RunId): Promise<RuntimeRun> {
    if (!this.has(runId) && !this.starts.has(runId)) return Promise.reject(new RuntimeError(`Run not found: ${runId}`, 'RUN_NOT_FOUND'));
    const run = this.runs.get(runId);
    if (run !== undefined && this.isTerminal(run.state)) return Promise.resolve(run);
    this.requestedPauses.delete(runId);
    this.requestedCancels.add(runId);
    return this.singleFlight(runId, async () => {
      await this.starts.get(runId);
      return this.stop(runId, 'cancelled');
    });
  }

  has(runId: RunId): boolean {
    return this.runs.has(runId);
  }

  get(runId: RunId): RuntimeRun {
    const run = this.runs.get(runId);
    if (run === undefined) throw new RuntimeError(`Run not found: ${runId}`, 'RUN_NOT_FOUND');
    return run;
  }

  private async validateAndFinish(runId: RunId): Promise<RuntimeRun> {
    await this.update(runId, { state: 'validating' });
    if (this.requestedCancels.has(runId)) return this.stop(runId, 'cancelled');
    let validation: EvaluationResult;
    try {
      const run = this.get(runId);
      const plan = this.plans.get(runId) ?? [];
      const history = this.results.get(runId) ?? [];
      const operationIds = new Set(plan.map((_, index) => `${runId}:${index}`));
      const latest = new Map(history.map((result) => [result.operationId, result]));
      const results = [...operationIds].flatMap((id) => { const result = latest.get(id); return result === undefined ? [] : [result]; });
      const complete = plan.length > 0 && results.length === plan.length && history.every((result) => result.operationId !== undefined && operationIds.has(result.operationId));
      const consistent = results.every((result) => result.status === 'succeeded' && !result.evidence.some((item) => item.status === 'contradicted'));
      validation = !complete || !consistent
        ? { ...this.auditFields(run.correlationId), status: !complete ? 'inconclusive' : 'rejected', checks: [{ name: 'final-step-results', passed: complete && consistent, evidenceIds: results.flatMap((result) => result.evidence.map((item) => item.id)) }], summary: !complete ? 'Final step results cannot be established' : 'Final step results failed or contain contradicted evidence' }
        : await this.dependencies.validator.validate(run, results);
    } catch (error: unknown) {
      return this.stop(runId, 'failed', this.error('VALIDATION_FAILED', this.message(error), false));
    }
    const state = validation.status === 'accepted' ? 'completed' : validation.status === 'blocked' ? 'blocked' : 'failed';
    return this.stop(runId, state, undefined, validation);
  }

  private async stop(runId: RunId, state: RuntimeRun['state'], error?: ExecutionError, validation?: EvaluationResult): Promise<RuntimeRun> {
    if (this.requestedCancels.has(runId)) { state = 'cancelled'; error = undefined; validation = undefined; }
    const run = this.get(runId);
    const durationMs = Date.now() - (this.startedAt.get(runId) ?? Date.now());
    const stopped: RuntimeRun = { ...run, state, error, validation, metrics: this.metrics(run, { durationMs }), updatedAt: new Date().toISOString() as ISO8601 };
    await this.dependencies.persistence?.saveRun(stopped);
    await this.saveCheckpoint(runId, state, this.nextSteps.get(runId) ?? 0, stopped);
    if (state !== 'cancelled' && this.requestedCancels.has(runId)) return this.stop(runId, 'cancelled');
    this.runs.set(runId, stopped);
    this.requestedCancels.delete(runId);
    return stopped;
  }

  private async update(runId: RunId, patch: Partial<RuntimeRun>): Promise<void> {
    const updated = { ...this.get(runId), ...patch, updatedAt: new Date().toISOString() as ISO8601 };
    await this.dependencies.persistence?.saveRun(updated);
    this.runs.set(runId, updated);
  }

  private async saveCheckpoint(runId: RunId, state: RuntimeRun['state'], step: number, run = this.get(runId)): Promise<void> {
    const store = this.dependencies.checkpointStore;
    if (store === undefined) return;
    const checkpoint: Checkpoint = { ...this.auditFields(run.correlationId), id: randomUUID() as EntityId, runId, step, state, checksum: createHash('sha256').update(JSON.stringify({ runId, step, state, files: run.changedFiles })).digest('hex'), resumable: state === 'paused' || state === 'awaiting_approval' || state === 'running' };
    await store.save(checkpoint);
  }

  private metrics(run: RuntimeRun, patch: Partial<RuntimeMetrics>): RuntimeMetrics {
    return { ...run.metrics, ...patch };
  }

  private auditFields(correlationId: string): Pick<RuntimeRun, 'schemaVersion' | 'createdAt' | 'updatedAt' | 'correlationId'> {
    const now = new Date().toISOString() as ISO8601;
    return { schemaVersion: CONTRACT_VERSION, createdAt: now, updatedAt: now, correlationId };
  }

  private error(code: string, message: string, retryable: boolean): ExecutionError { return { code, message, retryable }; }
  private message(error: unknown): string { return error instanceof Error ? error.message : 'Unknown runtime error'; }
  private isTerminal(state: RuntimeRun['state']): boolean { return state === 'completed' || state === 'failed' || state === 'cancelled' || state === 'blocked' || state === 'rolled_back'; }
  private nonNegativeInteger(value: number, field: string): number { if (!Number.isInteger(value) || value < 0) throw new RuntimeError(`${field} must be a non-negative integer`); return value; }
  private validateLimits(limits: RuntimeLimits): void { for (const [name, value] of Object.entries(limits)) if (!Number.isInteger(value) || value < 1) throw new RuntimeError(`Runtime limit ${name} must be a positive integer`); }
}
