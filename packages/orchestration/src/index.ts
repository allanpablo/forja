import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  CONTRACT_VERSION,
  type EntityId,
  type EvaluationResult,
  type Handoff,
  type ISO8601,
  type Sprint,
  type Task,
  type TokenBudget,
  validateTokenBudget,
} from '../../contracts/src/index.ts';

export interface ExecutionTransition {
  readonly recoveryBlock?: true;
  readonly beforeTask: Task;
  readonly task: Task;
  readonly beforeHandoff?: Handoff;
  readonly handoff?: Handoff;
}

export interface OrchestrationStore {
  transitionExecution(input: ExecutionTransition): void | Promise<void>;
  saveSprint(value: Sprint): void | Promise<void>;
  getSprint(id: EntityId): Sprint | undefined | Promise<Sprint | undefined>;
  listSprints(): readonly Sprint[] | Promise<readonly Sprint[]>;
  saveTask(value: Task): void | Promise<void>;
  getTask(id: EntityId): Task | undefined | Promise<Task | undefined>;
  listTasks(sprintId?: EntityId): readonly Task[] | Promise<readonly Task[]>;
  saveHandoff(value: Handoff): void | Promise<void>;
  getHandoff(id: EntityId): Handoff | undefined | Promise<Handoff | undefined>;
  listHandoffs(): readonly Handoff[] | Promise<readonly Handoff[]>;
}

export interface GraphRecorder {
  record(input: {
    readonly kind: 'sprint' | 'task' | 'handoff';
    readonly id: EntityId;
    readonly relatedIds: readonly EntityId[];
    readonly evidenceIds: readonly EntityId[];
  }): void | Promise<void>;
}

export interface CompletionValidator {
  validateTask(task: Task): EvaluationResult | Promise<EvaluationResult>;
  validateSprint(sprint: Sprint, tasks: readonly Task[]): EvaluationResult | Promise<EvaluationResult>;
}

export interface CreateSprintInput {
  readonly objective: string;
  readonly includedScope: readonly string[];
  readonly excludedScope: readonly string[];
  readonly budget: TokenBudget;
  readonly completionCriteria: readonly string[];
  readonly risks: readonly string[];
  readonly evidenceIds: readonly EntityId[];
  readonly correlationId?: string;
}

export interface CreateTaskInput {
  readonly sprintId: EntityId;
  readonly objective: string;
  readonly acceptanceCriteria: readonly string[];
  readonly allowedFiles: readonly string[];
  readonly dependencyIds: readonly EntityId[];
  readonly evidenceIds: readonly EntityId[];
  readonly budget: TokenBudget;
  readonly correlationId?: string;
}

export interface CreateHandoffInput {
  readonly taskId?: EntityId;
  readonly from: string;
  readonly to: string;
  readonly intent: string;
  readonly objective: string;
  readonly completedWork: readonly string[];
  readonly decisions: readonly string[];
  readonly constraints: readonly string[];
  readonly pending: readonly string[];
  readonly evidenceIds: readonly EntityId[];
  readonly acceptance: readonly string[];
  readonly blockers: readonly string[];
  readonly nextAgent: string;
  readonly correlationId?: string;
}

export class OrchestrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrchestrationError';
  }
}

// Compare persisted JSON values, not object identity, key order or timestamp alone.
function jsonSnapshot<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function sameSnapshot(expected: Task | Handoff, current: Task | Handoff | undefined): boolean {
  return current !== undefined && isDeepStrictEqual(jsonSnapshot(expected), jsonSnapshot(current));
}
function requireId(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) throw new OrchestrationError(`${field} must be a non-empty ID`);
}

/** Shared invariants for the two stores; callers must check and write without yielding. */
export function assertExecutionTransition(input: ExecutionTransition, currentTask: Task | undefined, currentHandoff?: Handoff): void {
  const { beforeTask, task, beforeHandoff, handoff } = input;
  for (const value of [beforeTask, task]) {
    requireId(value.id, 'task.id');
    requireId(value.sprintId, 'task.sprintId');
    if (value.runtimeRunId !== undefined) requireId(value.runtimeRunId, 'task.runtimeRunId');
    if (value.handoffId !== undefined) requireId(value.handoffId, 'task.handoffId');
  }
  if (beforeTask.id !== task.id || beforeTask.sprintId !== task.sprintId) throw new OrchestrationError('Execution transition cannot change task or sprint identity');
  if (beforeTask.runtimeRunId !== undefined && beforeTask.runtimeRunId !== task.runtimeRunId) throw new OrchestrationError(`Task is already linked to run: ${beforeTask.runtimeRunId}`);
  if (beforeTask.handoffId !== undefined && beforeTask.handoffId !== task.handoffId) throw new OrchestrationError('Execution transition cannot replace the linked handoff');
  if (beforeTask.executionScopeHash !== undefined && beforeTask.executionScopeHash !== task.executionScopeHash) throw new OrchestrationError('Execution scope cannot change after reservation');
  if (input.recoveryBlock && (task.status !== 'blocked' || !['RECOVERY_INCOMPLETE', 'BINDING_MISMATCH'].includes(task.executionError?.code ?? '') || beforeTask.runtimeRunId === undefined || beforeTask.runtimeRunId !== task.runtimeRunId)) throw new OrchestrationError('Recovery may only block an existing execution binding');
  if ((beforeHandoff === undefined) !== (handoff === undefined)) throw new OrchestrationError('Execution transition requires both handoff snapshots');
  if (handoff !== undefined && beforeHandoff !== undefined) {
    for (const value of [beforeHandoff, handoff]) {
      requireId(value.id, 'handoff.id');
      requireId(value.taskId, 'handoff.taskId');
      if (value.runId !== undefined) requireId(value.runId, 'handoff.runId');
    }
    if (beforeHandoff.id !== handoff.id || beforeHandoff.taskId !== task.id || handoff.taskId !== task.id || task.handoffId !== handoff.id) throw new OrchestrationError('Execution task/handoff pairing does not match');
    if (beforeTask.handoffId !== undefined && beforeTask.handoffId !== beforeHandoff.id) throw new OrchestrationError('Previous task/handoff pairing does not match');
    if (beforeHandoff.runId !== beforeTask.runtimeRunId || handoff.runId !== task.runtimeRunId || (beforeHandoff.runId !== undefined && beforeTask.handoffId !== beforeHandoff.id)) throw new OrchestrationError('Execution task/handoff run pairing does not match');
  } else if (!input.recoveryBlock && (beforeTask.handoffId !== undefined || task.handoffId !== undefined)) {
    throw new OrchestrationError('Linked handoff must participate in the execution transition');
  }
  if (!sameSnapshot(beforeTask, currentTask)) throw new OrchestrationError(`Task was modified concurrently: ${beforeTask.id}${currentTask?.runtimeRunId ? ` (run: ${currentTask.runtimeRunId})` : ''}`);
  if (beforeHandoff !== undefined && !sameSnapshot(beforeHandoff, currentHandoff)) throw new OrchestrationError(`Handoff was modified concurrently: ${beforeHandoff.id}`);
}

export class InMemoryOrchestrationStore implements OrchestrationStore {
  private readonly sprints = new Map<EntityId, Sprint>();
  private readonly tasks = new Map<EntityId, Task>();
  private readonly handoffs = new Map<EntityId, Handoff>();

  saveSprint(value: Sprint): void { this.sprints.set(value.id, value); }
  getSprint(id: EntityId): Sprint | undefined { return this.sprints.get(id); }
  listSprints(): readonly Sprint[] { return [...this.sprints.values()]; }
  saveTask(value: Task): void { this.tasks.set(value.id, jsonSnapshot(value)); }
  getTask(id: EntityId): Task | undefined { const value = this.tasks.get(id); return value === undefined ? undefined : jsonSnapshot(value); }
  listTasks(sprintId?: EntityId): readonly Task[] {
    const values = [...this.tasks.values()];
    return jsonSnapshot(sprintId === undefined ? values : values.filter((task) => task.sprintId === sprintId));
  }
  saveHandoff(value: Handoff): void { this.handoffs.set(value.id, jsonSnapshot(value)); }
  getHandoff(id: EntityId): Handoff | undefined { const value = this.handoffs.get(id); return value === undefined ? undefined : jsonSnapshot(value); }
  listHandoffs(): readonly Handoff[] { return jsonSnapshot([...this.handoffs.values()]); }

  transitionExecution(input: ExecutionTransition): void {
    // Prepare both values before touching either map, including all serialization failures.
    const snapshot = jsonSnapshot(input);
    assertExecutionTransition(snapshot, this.tasks.get(snapshot.beforeTask.id), snapshot.beforeHandoff === undefined ? undefined : this.handoffs.get(snapshot.beforeHandoff.id));
    this.tasks.set(snapshot.task.id, snapshot.task);
    if (snapshot.handoff !== undefined) this.handoffs.set(snapshot.handoff.id, snapshot.handoff);
  }
}

export class SprintEngine {
  private readonly store: OrchestrationStore;
  private readonly graph?: GraphRecorder;
  constructor(store: OrchestrationStore, graph?: GraphRecorder) { this.store = store; this.graph = graph; }

  async create(input: CreateSprintInput): Promise<Sprint> {
    this.requireText(input.objective, 'objective');
    this.requireItems(input.completionCriteria, 'completionCriteria');
    validateTokenBudget(input.budget);
    const value = this.audit<Sprint>(input.correlationId ?? `sprint:${input.objective}`, {
      id: this.id(), objective: input.objective.trim(), includedScope: this.clean(input.includedScope),
      excludedScope: this.clean(input.excludedScope), budget: input.budget,
      completionCriteria: this.clean(input.completionCriteria), risks: this.clean(input.risks),
      taskIds: [], evidenceIds: this.unique(input.evidenceIds), status: 'planned',
    });
    await this.store.saveSprint(value);
    await this.record('sprint', value.id, [], value.evidenceIds);
    return value;
  }

  async start(id: EntityId): Promise<Sprint> { return this.transition(id, ['planned', 'paused'], 'active'); }
  async pause(id: EntityId): Promise<Sprint> { return this.transition(id, ['active'], 'paused'); }

  async attachTask(sprintId: EntityId, taskId: EntityId): Promise<Sprint> {
    const sprint = await this.requireSprint(sprintId);
    if (sprint.status === 'completed' || sprint.status === 'cancelled') throw new OrchestrationError('Cannot attach a task to a closed sprint');
    if (sprint.taskIds.includes(taskId)) return sprint;
    const updated = this.updated(sprint, { taskIds: [...sprint.taskIds, taskId] });
    await this.saveSprintGuarded(sprint, updated);
    await this.record('sprint', updated.id, [taskId], updated.evidenceIds);
    return updated;
  }

  async complete(id: EntityId, validator: CompletionValidator): Promise<Sprint> {
    const sprint = await this.requireSprint(id);
    const tasks = await this.store.listTasks(id);
    if (sprint.status !== 'active' && sprint.status !== 'paused') throw new OrchestrationError('Only an active or paused sprint can be completed');
    if (tasks.length !== sprint.taskIds.length || tasks.some((task) => task.status !== 'done')) throw new OrchestrationError('Sprint cannot complete before every task is done');
    const result = await validator.validateSprint(sprint, tasks);
    if (result.status !== 'accepted') throw new OrchestrationError(`Sprint validation did not accept completion: ${result.status}`);
    const updated = this.updated(sprint, { status: 'completed', evidenceIds: this.unique([...sprint.evidenceIds, ...this.evidenceFrom(result)]) });
    await this.saveSprintGuarded(sprint, updated);
    await this.record('sprint', updated.id, updated.taskIds, updated.evidenceIds);
    return updated;
  }

  private async transition(id: EntityId, allowed: readonly Sprint['status'][], status: Sprint['status']): Promise<Sprint> {
    const sprint = await this.requireSprint(id);
    if (!allowed.includes(sprint.status)) throw new OrchestrationError(`Invalid sprint transition from ${sprint.status} to ${status}`);
    const updated = this.updated(sprint, { status });
    await this.saveSprintGuarded(sprint, updated);
    await this.record('sprint', updated.id, updated.taskIds, updated.evidenceIds);
    return updated;
  }

  /**
   * Read-modify-write without this is a lost-update race: two concurrent callers can both read
   * the same `sprint`, compute different `updated` values, and the second `saveSprint` silently
   * clobbers the first. Re-checking `updatedAt` immediately before writing narrows that window to
   * the store's own read/write latency instead of this method's full async body.
   */
  private async saveSprintGuarded(before: Sprint, after: Sprint): Promise<void> {
    const current = await this.store.getSprint(before.id);
    if (current === undefined || current.updatedAt !== before.updatedAt) throw new OrchestrationError(`Sprint was modified concurrently: ${before.id}`);
    await this.store.saveSprint(after);
  }

  private async requireSprint(id: EntityId): Promise<Sprint> { const value = await this.store.getSprint(id); if (!value) throw new OrchestrationError(`Sprint not found: ${id}`); return value; }
  private async record(kind: 'sprint' | 'task' | 'handoff', id: EntityId, relatedIds: readonly EntityId[], evidenceIds: readonly EntityId[]): Promise<void> { if (this.graph) await this.graph.record({ kind, id, relatedIds, evidenceIds }); }
  private updated(value: Sprint, changes: Partial<Sprint>): Sprint { return { ...value, ...changes, updatedAt: new Date().toISOString() as ISO8601 }; }
  private audit<T extends Sprint | Task | Handoff>(correlationId: string, value: Omit<T, keyof ReturnType<SprintEngine['auditFields']>>): T { return { ...value, schemaVersion: CONTRACT_VERSION, createdAt: new Date().toISOString() as ISO8601, updatedAt: new Date().toISOString() as ISO8601, correlationId } as T; }
  private auditFields(): AuditShape { return { schemaVersion: CONTRACT_VERSION, createdAt: '' as ISO8601, updatedAt: '' as ISO8601, correlationId: '' }; }
  private id(): EntityId { return randomUUID() as EntityId; }
  private clean(values: readonly string[]): readonly string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
  private unique(values: readonly EntityId[]): readonly EntityId[] { return [...new Set(values)]; }
  private requireText(value: string, path: string): void { if (value.trim().length === 0) throw new OrchestrationError(`${path} is required`); }
  private requireItems(values: readonly string[], path: string): void { if (this.clean(values).length === 0) throw new OrchestrationError(`${path} must not be empty`); }
  private evidenceFrom(result: EvaluationResult): EntityId[] { return result.checks.flatMap((check) => check.evidenceIds); }
}

type AuditShape = { readonly schemaVersion: typeof CONTRACT_VERSION; readonly createdAt: ISO8601; readonly updatedAt: ISO8601; readonly correlationId: string };

export class TaskEngine {
  private readonly store: OrchestrationStore;
  private readonly sprintEngine: SprintEngine;
  private readonly graph?: GraphRecorder;
  constructor(store: OrchestrationStore, sprintEngine: SprintEngine, graph?: GraphRecorder) { this.store = store; this.sprintEngine = sprintEngine; this.graph = graph; }

  async create(input: CreateTaskInput): Promise<Task> {
    const sprint = await this.store.getSprint(input.sprintId);
    if (!sprint || sprint.status === 'completed' || sprint.status === 'cancelled') throw new OrchestrationError('Task requires an open sprint');
    if (input.objective.trim().length === 0 || input.acceptanceCriteria.length === 0) throw new OrchestrationError('Task objective and acceptance criteria are required');
    await this.assertDependencies(input, false);
    validateTokenBudget(input.budget);
    const value: Task = { schemaVersion: CONTRACT_VERSION, createdAt: new Date().toISOString() as ISO8601, updatedAt: new Date().toISOString() as ISO8601, correlationId: input.correlationId ?? `task:${input.objective}`, id: randomUUID() as EntityId, sprintId: input.sprintId, objective: input.objective.trim(), acceptanceCriteria: this.clean(input.acceptanceCriteria), allowedFiles: this.clean(input.allowedFiles), dependencyIds: this.unique(input.dependencyIds), evidenceIds: this.unique(input.evidenceIds), budget: input.budget, status: 'todo' };
    await this.store.saveTask(value);
    await this.sprintEngine.attachTask(input.sprintId, value.id);
    if (this.graph) await this.graph.record({ kind: 'task', id: value.id, relatedIds: [value.sprintId, ...value.dependencyIds], evidenceIds: value.evidenceIds });
    return value;
  }

  async assertEligible(task: Task): Promise<void> {
    const sprint = await this.store.getSprint(task.sprintId);
    if (!sprint || sprint.status !== 'active') throw new OrchestrationError('Task requires an active sprint');
    await this.assertDependencies(task, true);
  }

  async next(sprintId: EntityId): Promise<Task | undefined> {
    const sprint = await this.store.getSprint(sprintId);
    if (!sprint || sprint.status !== 'active') return undefined;
    const tasks = (await this.store.listTasks(sprintId))
      .filter((task) => task.status === 'todo' && task.runtimeRunId === undefined)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (const task of tasks) {
      try { await this.assertEligible(task); return task; }
      catch (error) { if (!(error instanceof OrchestrationError)) throw error; }
    }
    return undefined;
  }

  async start(id: EntityId): Promise<Task> {
    const task = await this.require(id);
    this.assertUnlinked(task);
    if (task.status !== 'todo' && task.status !== 'blocked') throw new OrchestrationError(`Invalid task start from ${task.status}`);
    await this.assertEligible(task);
    const updated = this.updated(task, { status: 'in_progress' }); await this.saveTaskGuarded(task, updated); return updated;
  }

  async block(id: EntityId): Promise<Task> { const task = await this.require(id); this.assertUnlinked(task); if (task.status !== 'in_progress') throw new OrchestrationError('Only an in-progress task can be blocked'); const updated = this.updated(task, { status: 'blocked' }); await this.saveTaskGuarded(task, updated); return updated; }

  async complete(id: EntityId, validator: CompletionValidator): Promise<Task> {
    const task = await this.require(id);
    this.assertUnlinked(task);
    if (task.status !== 'in_progress') throw new OrchestrationError('Only an in-progress task can be completed');
    const result = await validator.validateTask(jsonSnapshot(task));
    if (result.status !== 'accepted') throw new OrchestrationError(`Task validation did not accept completion: ${result.status}`);
    const evidenceIds = this.unique([...task.evidenceIds, ...result.checks.flatMap((check) => check.evidenceIds)]);
    const updated = this.updated(task, { status: 'done', evidenceIds }); await this.saveTaskGuarded(task, updated);
    if (this.graph) await this.graph.record({ kind: 'task', id: updated.id, relatedIds: [updated.sprintId, ...updated.dependencyIds], evidenceIds }); return updated;
  }

  private async assertDependencies(task: Pick<Task, 'sprintId' | 'dependencyIds'>, requireDone: boolean): Promise<void> {
    for (const id of task.dependencyIds) {
      const dependency = await this.store.getTask(id);
      if (!dependency || dependency.sprintId !== task.sprintId) throw new OrchestrationError(`Task dependency must exist in the same sprint: ${id}`);
      if (requireDone && dependency.status !== 'done') throw new OrchestrationError(`Task dependency is not done: ${id}`);
    }
  }

  private assertUnlinked(task: Task): void {
    if (task.runtimeRunId !== undefined) throw new OrchestrationError(`Task is linked to runtime run: ${task.runtimeRunId}; use execution coordination`);
  }

  private async saveTaskGuarded(before: Task, after: Task): Promise<void> {
    // The store compares the full pre-validation snapshot and writes without an async gap.
    this.assertUnlinked(before);
    await this.store.transitionExecution({ beforeTask: before, task: after });
  }

  private async require(id: EntityId): Promise<Task> { const value = await this.store.getTask(id); if (!value) throw new OrchestrationError(`Task not found: ${id}`); return jsonSnapshot(value); }
  private updated(value: Task, changes: Partial<Task>): Task { return { ...value, ...changes, updatedAt: new Date().toISOString() as ISO8601 }; }
  private clean(values: readonly string[]): readonly string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
  private unique(values: readonly EntityId[]): readonly EntityId[] { return [...new Set(values)]; }
}

export class HandoffEngine {
  private readonly store: OrchestrationStore;
  private readonly graph?: GraphRecorder;
  private readonly maxItems: number;
  private readonly maxItemLength: number;
  private readonly maxHandoffsPerCorrelation: number;
  constructor(store: OrchestrationStore, graph?: GraphRecorder, maxItems = 20, maxItemLength = 500, maxHandoffsPerCorrelation = 200) { this.store = store; this.graph = graph; this.maxItems = maxItems; this.maxItemLength = maxItemLength; this.maxHandoffsPerCorrelation = maxHandoffsPerCorrelation; }

  async create(input: CreateHandoffInput): Promise<Handoff> {
    for (const [name, value] of Object.entries({ from: input.from, to: input.to, intent: input.intent, objective: input.objective, nextAgent: input.nextAgent })) if (value.trim().length === 0) throw new OrchestrationError(`Handoff ${name} is required`);
    if (input.acceptance.length === 0) throw new OrchestrationError('Handoff acceptance is required');
    if (input.evidenceIds.length === 0) throw new OrchestrationError('Handoff requires evidence references');
    const fields: AuditShape = { schemaVersion: CONTRACT_VERSION, createdAt: new Date().toISOString() as ISO8601, updatedAt: new Date().toISOString() as ISO8601, correlationId: input.correlationId ?? `handoff:${input.intent}` };
    // Nothing else bounds how many handoffs a single run can chain through (A→B→A→B→… has no
    // structural cycle marker to detect), so this is the circuit breaker: past this count for one
    // correlationId, something is looping without a human/gate in the loop, and it should fail
    // loudly rather than accumulate audit records forever.
    const priorForRun = (await this.store.listHandoffs()).filter((handoff) => handoff.correlationId === fields.correlationId).length;
    if (priorForRun >= this.maxHandoffsPerCorrelation) throw new OrchestrationError(`Handoff chain exceeded ${this.maxHandoffsPerCorrelation} handoffs for correlationId ${fields.correlationId} — likely an unbounded loop`);
    if (input.taskId !== undefined) {
      requireId(input.taskId, 'Handoff taskId');
      const task = await this.store.getTask(input.taskId);
      if (!task) throw new OrchestrationError(`Handoff task not found: ${input.taskId}`);
      const sprint = await this.store.getSprint(task.sprintId);
      if (!sprint || sprint.status === 'completed' || sprint.status === 'cancelled') throw new OrchestrationError('Handoff task requires an open sprint');
      if (task.runtimeRunId !== undefined) throw new OrchestrationError(`Handoff task is already linked to run: ${task.runtimeRunId}`);
    }
    const value: Handoff = { ...fields, ...(input.taskId === undefined ? {} : { taskId: input.taskId, status: 'pending' as const }), id: randomUUID() as EntityId, from: input.from.trim(), to: input.to.trim(), intent: input.intent.trim(), objective: input.objective.trim(), completedWork: this.compact(input.completedWork), decisions: this.compact(input.decisions), constraints: this.compact(input.constraints), pending: this.compact(input.pending), evidenceIds: [...new Set(input.evidenceIds)], acceptance: this.compact(input.acceptance), blockers: this.compact(input.blockers), nextAgent: input.nextAgent.trim() };
    await this.store.saveHandoff(value);
    if (this.graph) await this.graph.record({ kind: 'handoff', id: value.id, relatedIds: value.evidenceIds, evidenceIds: value.evidenceIds });
    return value;
  }

  private compact(values: readonly string[]): readonly string[] { if (values.length > this.maxItems) throw new OrchestrationError(`Handoff section exceeds ${this.maxItems} items`); const result = [...new Set(values.map((value) => value.trim()).filter(Boolean))]; if (result.some((value) => value.length > this.maxItemLength)) throw new OrchestrationError(`Handoff item exceeds ${this.maxItemLength} characters`); return result; }
}
