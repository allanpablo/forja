import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { AgentIdentity, EntityId, EvaluationResult, ExecutionError, ExecutionResult, Handoff, ISO8601, RunId, RuntimeRun, Task, TokenBudget } from '../../../packages/contracts/src/index.ts';
import type { CapabilityPolicy } from '../../../packages/core/src/index.ts';
import { OrchestrationError, type OrchestrationStore, type TaskEngine } from '../../../packages/orchestration/src/index.ts';
import { RuntimeError, type RuntimeEngine, type RuntimePersistence, type RuntimePlanStep } from '../../../packages/runtime/src/index.ts';

export interface TaskRuntimeInput {
  readonly objective: string;
  readonly agent: AgentIdentity;
  readonly budget: TokenBudget;
  readonly steps: readonly RuntimePlanStep[];
  readonly taskId?: EntityId;
  readonly sprintId?: EntityId;
  readonly handoffId?: EntityId;
  readonly correlationId?: string;
}

export interface TaskValidationContext { readonly task: Task; readonly handoff?: Handoff; }
export interface TaskRuntimeValidator {
  validate(run: RuntimeRun, results: readonly ExecutionResult[], context?: TaskValidationContext): EvaluationResult | Promise<EvaluationResult>;
}

export class TaskCoordinationError extends OrchestrationError {
  constructor(readonly code: string, message: string, readonly runId?: RunId) { super(message); this.name = 'TaskCoordinationError'; }
}

export class TaskRuntimeCoordinator {
  private readonly projections = new Map<RunId, Promise<void>>();
  private readonly invalidBindings = new Set<RunId>();

  constructor(
    private readonly runtime: RuntimeEngine,
    private readonly policy: CapabilityPolicy,
    private readonly store: OrchestrationStore,
    private readonly tasks: TaskEngine,
    private readonly persistence?: RuntimePersistence,
  ) {}

  async initialize(): Promise<void> {
    for (const task of await this.store.listTasks()) {
      if (task.runtimeRunId === undefined) continue;
      let run = await this.persistence?.getRun(task.runtimeRunId);
      if (run === undefined) {
        await this.blockRecovery(task, 'RECOVERY_INCOMPLETE', 'Reserved execution is missing');
        continue;
      }
      if (run.runId !== task.runtimeRunId || run.taskId !== task.id || run.sprintId !== task.sprintId || run.handoffId !== task.handoffId) {
        await this.blockRecovery(task, 'BINDING_MISMATCH', 'Persisted execution does not match its reserving task');
        continue;
      }
      if (run.state === 'running' || run.state === 'validating') {
        run = { ...run, state: 'blocked', validation: undefined, error: this.error('RECOVERY_INTERRUPTED', 'Interrupted execution requires review before any further work'), updatedAt: this.now() };
        await this.persistence?.saveRun(run);
      }
      try { await this.runtime.recover(run.runId, this.policy); }
      catch (error: unknown) {
        if (!(error instanceof RuntimeError) || !['RECOVERY_INCOMPLETE', 'RUN_NOT_FOUND'].includes(error.code)) throw error;
        await this.blockRecovery(task, 'RECOVERY_INCOMPLETE', 'Persisted execution cannot be recovered safely');
        continue;
      }
      try { await this.project(run); }
      catch (error: unknown) {
        if (!(error instanceof TaskCoordinationError) || error.code !== 'BINDING_MISMATCH') throw error;
        await this.blockRecovery(task, error.code, error.message);
      }
    }
  }

  async start(input: TaskRuntimeInput, context: unknown): Promise<RuntimeRun> {
    const runId = randomUUID() as RunId;
    let sprintId = input.sprintId;
    if (input.handoffId !== undefined && input.taskId === undefined) throw new TaskCoordinationError('INVALID_BINDING', 'Handoff requires a task');
    if (input.taskId !== undefined) {
      const task = await this.store.getTask(input.taskId);
      if (task === undefined) throw new TaskCoordinationError('TASK_NOT_FOUND', 'Task does not exist');
      if (task.runtimeRunId !== undefined) throw new TaskCoordinationError('TASK_ALREADY_BOUND', 'Task already has an execution', task.runtimeRunId);
      if (task.status !== 'todo' && task.status !== 'in_progress') throw new TaskCoordinationError('TASK_NOT_READY', 'Task is not ready for execution');
      await this.tasks.assertEligible(task);
      if (sprintId !== undefined && sprintId !== task.sprintId) throw new TaskCoordinationError('INVALID_BINDING', 'Task and sprint do not match');
      sprintId = task.sprintId;
      this.validateScope(task, input);
      const handoff = input.handoffId === undefined ? undefined : await this.store.getHandoff(input.handoffId);
      if (input.handoffId !== undefined && (handoff === undefined || handoff.taskId !== task.id || handoff.runId !== undefined || handoff.status !== 'pending' || handoff.blockers.length > 0 || handoff.nextAgent !== input.agent.id)) {
        throw new TaskCoordinationError('INVALID_BINDING', 'Handoff is not available for this task and agent');
      }
      await this.store.transitionExecution({
        beforeTask: task,
        task: { ...task, runtimeRunId: runId, handoffId: handoff?.id, executionScopeHash: this.scopeHash(task, handoff), status: 'in_progress', executionError: undefined, updatedAt: this.now() },
        beforeHandoff: handoff,
        handoff: handoff === undefined ? undefined : { ...handoff, runId, status: 'in_progress', updatedAt: this.now() },
      });
    }
    const run = await this.runtime.start({ ...input, runId, sprintId, policy: this.policy, context });
    await this.project(run);
    return run;
  }

  async get(runId: RunId): Promise<RuntimeRun> {
    await this.load(runId);
    return this.runtime.get(runId);
  }

  async execute(runId: RunId): Promise<RuntimeRun> {
    await this.load(runId);
    await this.assertBinding(this.runtime.get(runId));
    const run = await this.runtime.execute(runId);
    await this.project(run);
    return run;
  }

  async resume(runId: RunId): Promise<RuntimeRun> {
    await this.load(runId);
    const current = this.runtime.get(runId);
    await this.assertBinding(current);
    const run = this.terminal(current) ? current : await this.runtime.resume(runId, this.policy);
    await this.project(run);
    return run;
  }

  async pause(runId: RunId): Promise<RuntimeRun> {
    await this.load(runId);
    await this.assertBinding(this.runtime.get(runId));
    const run = this.runtime.pause(runId);
    await this.project(run);
    return run;
  }

  async cancel(runId: RunId): Promise<RuntimeRun> {
    await this.load(runId);
    await this.assertBinding(this.runtime.get(runId));
    const run = await this.runtime.cancel(runId);
    await this.project(run);
    return run;
  }

  executionStarted(run: RuntimeRun): Promise<void> { return this.project(run); }

  async validationContext(run: RuntimeRun): Promise<TaskValidationContext | undefined> {
    return this.assertBinding(run);
  }

  private async load(runId: RunId): Promise<void> {
    if (this.invalidBindings.has(runId)) throw new TaskCoordinationError('BINDING_MISMATCH', 'Execution binding requires review', runId);
    if (!this.runtime.has(runId)) await this.runtime.recover(runId, this.policy);
  }

  private async assertBinding(run: RuntimeRun): Promise<TaskValidationContext | undefined> {
    if (run.taskId === undefined) return undefined;
    const task = await this.store.getTask(run.taskId);
    if (task !== undefined && task.runtimeRunId === undefined) return undefined;
    if (task === undefined || task.runtimeRunId !== run.runId || task.sprintId !== run.sprintId || task.handoffId !== run.handoffId || task.objective !== run.objective) {
      throw new TaskCoordinationError('BINDING_MISMATCH', 'Execution does not match its task binding', run.runId);
    }
    if (task.executionError?.code === 'RECOVERY_INCOMPLETE' || task.executionError?.code === 'BINDING_MISMATCH') throw new TaskCoordinationError('BINDING_MISMATCH', 'Task recovery requires review', run.runId);
    const handoff = task.handoffId === undefined ? undefined : await this.store.getHandoff(task.handoffId);
    if (task.handoffId !== undefined && (handoff === undefined || handoff.taskId !== task.id || handoff.runId !== run.runId || handoff.nextAgent !== run.agent.id)) {
      throw new TaskCoordinationError('BINDING_MISMATCH', 'Execution does not match its handoff binding', run.runId);
    }
    if (task.executionScopeHash !== this.scopeHash(task, handoff)) throw new TaskCoordinationError('BINDING_MISMATCH', 'Task or handoff scope changed after execution was reserved', run.runId);
    return { task, handoff };
  }

  private project(run: RuntimeRun): Promise<void> {
    const previous = this.projections.get(run.runId) ?? Promise.resolve();
    const operation = previous.then(() => this.projectOnce(run), () => this.projectOnce(run));
    this.projections.set(run.runId, operation);
    return operation.finally(() => { if (this.projections.get(run.runId) === operation) this.projections.delete(run.runId); });
  }

  private async projectOnce(result: RuntimeRun): Promise<void> {
    // A store can expose a write before its promise/checkpoint has confirmed the transition.
    const run = this.runtime.get(result.runId);
    const linked = await this.assertBinding(run);
    if (linked === undefined) return;
    const { task, handoff } = linked;
    if (run.state === 'completed' && run.validation?.status !== 'accepted') throw new TaskCoordinationError('BINDING_MISMATCH', 'Completed execution lacks accepted validation', run.runId);
    const status: Task['status'] = run.state === 'completed' ? 'done' : run.state === 'cancelled' ? 'cancelled' : ['failed', 'blocked', 'paused', 'awaiting_approval', 'rolled_back'].includes(run.state) ? 'blocked' : 'in_progress';
    const evidenceIds = [...new Set([...task.evidenceIds, ...(run.validation?.checks.flatMap((check) => check.evidenceIds) ?? [])])];
    const executionError = run.error ?? (status === 'blocked' && run.validation !== undefined ? this.error(`VALIDATION_${run.validation.status.toUpperCase()}`, run.validation.summary) : undefined);
    const nextTask: Task = { ...task, status, evidenceIds, executionError };
    const nextHandoff: Handoff | undefined = handoff === undefined ? undefined : { ...handoff, status: status === 'done' ? 'completed' : status, evidenceIds: [...new Set([...handoff.evidenceIds, ...(run.validation?.checks.flatMap((check) => check.evidenceIds) ?? [])])] };
    if (this.equal(task, nextTask) && this.equal(handoff, nextHandoff)) return;
    try {
      await this.store.transitionExecution({ beforeTask: task, task: { ...nextTask, updatedAt: this.now() }, beforeHandoff: handoff, handoff: nextHandoff === undefined ? undefined : { ...nextHandoff, updatedAt: this.now() } });
    } catch (error: unknown) {
      throw new TaskCoordinationError('PROJECTION_PENDING', error instanceof Error ? error.message : 'Task projection failed', run.runId);
    }
  }

  private async blockRecovery(task: Task, code: string, message: string): Promise<void> {
    if (task.runtimeRunId !== undefined) this.invalidBindings.add(task.runtimeRunId);
    const handoff = task.handoffId === undefined ? undefined : await this.store.getHandoff(task.handoffId);
    const ownedHandoff = handoff?.taskId === task.id && handoff.runId === task.runtimeRunId ? handoff : undefined;
    await this.store.transitionExecution({ recoveryBlock: true, beforeTask: task, task: { ...task, status: 'blocked', executionError: this.error(code, message), updatedAt: this.now() }, beforeHandoff: ownedHandoff, handoff: ownedHandoff === undefined ? undefined : { ...ownedHandoff, status: 'blocked', updatedAt: this.now() } });
  }

  private scopeHash(task: Task, handoff?: Handoff): string {
    const scope = {
      objective: task.objective, acceptanceCriteria: task.acceptanceCriteria, allowedFiles: task.allowedFiles, dependencyIds: task.dependencyIds,
      budget: { inputTokens: task.budget.inputTokens, outputTokens: task.budget.outputTokens, totalTokens: task.budget.totalTokens },
      handoff: handoff === undefined ? undefined : { from: handoff.from, to: handoff.to, nextAgent: handoff.nextAgent, intent: handoff.intent, objective: handoff.objective, completedWork: handoff.completedWork, decisions: handoff.decisions, constraints: handoff.constraints, pending: handoff.pending, acceptance: handoff.acceptance, blockers: handoff.blockers },
    };
    return `v1:${createHash('sha256').update(JSON.stringify(scope)).digest('hex')}`;
  }

  private validateScope(task: Task, input: TaskRuntimeInput): void {
    if (input.objective !== task.objective) throw new TaskCoordinationError('TASK_SCOPE_MISMATCH', 'Execution objective must match the task');
    if (input.budget.inputTokens > task.budget.inputTokens || input.budget.outputTokens > task.budget.outputTokens || input.budget.totalTokens > task.budget.totalTokens || input.budget.usedTokens !== task.budget.usedTokens) {
      throw new TaskCoordinationError('TASK_SCOPE_MISMATCH', 'Execution budget exceeds task scope');
    }
    for (const file of input.steps.flatMap((step) => step.files ?? [])) {
      if (!this.relativePath(file) || !task.allowedFiles.some((allowed) => allowed === '*' || (this.relativePath(allowed) && (file === allowed || (allowed.endsWith('/') && file.startsWith(allowed)))))) {
        throw new TaskCoordinationError('TASK_SCOPE_MISMATCH', 'Execution files exceed task scope');
      }
    }
  }

  private relativePath(value: string): boolean { return value.length > 0 && !value.includes('\\') && !path.posix.isAbsolute(value) && !value.split('/').includes('..') && path.posix.normalize(value) === value; }
  private terminal(run: RuntimeRun): boolean { return ['completed', 'failed', 'blocked', 'cancelled', 'rolled_back'].includes(run.state); }
  private equal(left: unknown, right: unknown): boolean { return isDeepStrictEqual(left === undefined ? left : JSON.parse(JSON.stringify(left)), right === undefined ? right : JSON.parse(JSON.stringify(right))); }
  private error(code: string, message: string): ExecutionError { return { code, message, retryable: false }; }
  private now(): ISO8601 { return new Date().toISOString() as ISO8601; }
}
