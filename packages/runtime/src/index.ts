import { createHash, randomUUID } from 'node:crypto';
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
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
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

  constructor(dependencies: RuntimeDependencies, limits: Partial<RuntimeLimits> = {}) {
    this.dependencies = dependencies;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.validateLimits(this.limits);
  }

  async start(request: RuntimeStartRequest): Promise<RuntimeRun> {
    validateTokenBudget(request.budget);
    if (request.objective.trim().length === 0) throw new RuntimeError('Runtime objective is required');
    const runId = randomUUID() as RunId;
    const fields = this.auditFields(request.correlationId ?? runId);
    const run: RuntimeRun = {
      ...fields,
      runId,
      objective: request.objective,
      agent: request.agent,
      sprintId: request.sprintId,
      taskId: request.taskId,
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

    try {
      this.update(runId, { state: 'planning' });
      const context = this.dependencies.contextBuilder === undefined ? undefined : await this.dependencies.contextBuilder.build(request.objective);
      const plan = [...await this.dependencies.planner.plan(request.objective, context)];
      if (plan.length > this.limits.maxSteps) return this.stop(runId, 'blocked', this.error('MAX_STEPS_EXCEEDED', 'Plan exceeds maximum steps', false));
      this.plans.set(runId, plan);
      await this.dependencies.persistence?.savePlan(runId, plan);
      await this.persist(runId);
      await this.saveCheckpoint(runId, 'planning', 0);
      return this.get(runId);
    } catch (error: unknown) {
      return this.stop(runId, 'failed', this.error('PLANNING_FAILED', this.message(error), false));
    }
  }

  async execute(runId: RunId): Promise<RuntimeRun> {
    const current = this.get(runId);
    if (this.isTerminal(current.state)) return current;
    const plan = this.plans.get(runId);
    if (plan === undefined) return this.stop(runId, 'failed', this.error('PLAN_NOT_FOUND', 'Runtime plan is missing', false));
    this.update(runId, { state: 'running' });

    while (true) {
      const run = this.get(runId);
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
        this.update(runId, { steps: beforeAttempt.steps + 1, budget: { ...beforeAttempt.budget, usedTokens: projectedTokens }, metrics: this.metrics(beforeAttempt, { attempts: beforeAttempt.metrics.attempts + 1, inputTokens: beforeAttempt.metrics.inputTokens + estimatedTokens }) });
        result = await this.dependencies.registry.execute({
          input: { capabilityId: step.capabilityId as CapabilityExecutionRequest['input']['capabilityId'], payload: step.payload },
          agent: run.agent,
          policy: this.policies.get(runId) ?? (() => { throw new RuntimeError('Runtime policy is missing'); })(),
          projectId: step.projectId,
          environment: step.environment,
          categories: step.categories,
          files: step.files,
          budget: beforeAttempt.budget,
          approval: step.approval,
        } as CapabilityExecutionRequest);
        this.results.get(runId)?.push(result);
        await this.dependencies.persistence?.saveResults(runId, this.results.get(runId) ?? []);
        if (result.status === 'succeeded') break;
        if (!result.error?.retryable || attempt > this.limits.maxRetries) break;
        const afterAttempt = this.get(runId);
        this.update(runId, { metrics: this.metrics(afterAttempt, { retries: afterAttempt.metrics.retries + 1 }) });
      } while (attempt <= this.limits.maxRetries);

      if (result.status !== 'succeeded') {
        const state = result.error?.code === 'APPROVAL_REQUIRED' ? 'awaiting_approval' : result.error?.code === 'POLICY_DENIED' ? 'blocked' : 'failed';
        return this.stop(runId, state, result.error);
      }
      this.update(runId, { evidence: [...this.get(runId).evidence, ...result.evidence], changedFiles: files });
      await this.dependencies.memory?.remember(this.get(runId), result);
      this.nextSteps.set(runId, index + 1);
      await this.dependencies.persistence?.saveCursor(runId, index + 1, this.startedAt.get(runId) ?? Date.now());
      await this.saveCheckpoint(runId, 'running', index + 1);
    }
  }

  async recover(runId: RunId, policy: CapabilityExecutionRequest['policy']): Promise<RuntimeRun> {
    const persistence = this.dependencies.persistence;
    if (persistence === undefined) throw new RuntimeError('Runtime persistence is not configured');
    const run = await persistence.getRun(runId);
    const plan = await persistence.getPlan(runId);
    if (run === undefined || plan === undefined) throw new RuntimeError(`Persisted runtime is incomplete: ${runId}`);
    const results = await persistence.getResults(runId);
    const cursor = await persistence.getCursor(runId);
    this.runs.set(runId, run);
    this.plans.set(runId, plan);
    this.results.set(runId, [...(results ?? [])]);
    this.nextSteps.set(runId, cursor?.nextStep ?? run.steps);
    this.policies.set(runId, policy);
    this.startedAt.set(runId, cursor?.startedAt ?? Date.parse(run.createdAt));
    return run;
  }

  async resume(runId: RunId, policy?: CapabilityExecutionRequest['policy']): Promise<RuntimeRun> {
    if (!this.runs.has(runId) && policy !== undefined) await this.recover(runId, policy);
    const run = this.get(runId);
    if (run.state !== 'paused' && run.state !== 'awaiting_approval') throw new RuntimeError(`Run is not resumable: ${run.state}`);
    return this.execute(runId);
  }

  pause(runId: RunId): RuntimeRun {
    const run = this.get(runId);
    if (run.state === 'running') this.requestedPauses.add(runId);
    return run;
  }

  async cancel(runId: RunId): Promise<RuntimeRun> {
    const run = this.get(runId);
    if (this.isTerminal(run.state)) return run;
    this.requestedPauses.delete(runId);
    return this.stop(runId, 'cancelled');
  }

  get(runId: RunId): RuntimeRun {
    const run = this.runs.get(runId);
    if (run === undefined) throw new RuntimeError(`Run not found: ${runId}`);
    return run;
  }

  private async validateAndFinish(runId: RunId): Promise<RuntimeRun> {
    this.update(runId, { state: 'validating' });
    try {
      const run = this.get(runId);
      const validation = await this.dependencies.validator.validate(run, this.results.get(runId) ?? []);
      const state = validation.status === 'accepted' ? 'completed' : validation.status === 'blocked' ? 'blocked' : 'failed';
      return this.stop(runId, state, undefined, validation);
    } catch (error: unknown) {
      return this.stop(runId, 'failed', this.error('VALIDATION_FAILED', this.message(error), false));
    }
  }

  private stop(runId: RunId, state: RuntimeRun['state'], error?: ExecutionError, validation?: EvaluationResult): RuntimeRun {
    const run = this.get(runId);
    const durationMs = Date.now() - (this.startedAt.get(runId) ?? Date.now());
    this.update(runId, { state, error, validation, metrics: this.metrics(run, { durationMs }) });
    void this.saveCheckpoint(runId, state, this.nextSteps.get(runId) ?? 0);
    return this.get(runId);
  }

  private update(runId: RunId, patch: Partial<RuntimeRun>): void {
    this.runs.set(runId, { ...this.get(runId), ...patch, updatedAt: new Date().toISOString() as ISO8601 });
    void this.persist(runId);
  }

  private async persist(runId: RunId): Promise<void> {
    const persistence = this.dependencies.persistence;
    if (persistence === undefined) return;
    await persistence.saveRun(this.get(runId));
  }

  private async saveCheckpoint(runId: RunId, state: RuntimeRun['state'], step: number): Promise<void> {
    const store = this.dependencies.checkpointStore;
    if (store === undefined) return;
    const run = this.get(runId);
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
