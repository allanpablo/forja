import { randomUUID } from 'node:crypto';
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

export interface OrchestrationStore {
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

export class InMemoryOrchestrationStore implements OrchestrationStore {
  private readonly sprints = new Map<EntityId, Sprint>();
  private readonly tasks = new Map<EntityId, Task>();
  private readonly handoffs = new Map<EntityId, Handoff>();

  saveSprint(value: Sprint): void { this.sprints.set(value.id, value); }
  getSprint(id: EntityId): Sprint | undefined { return this.sprints.get(id); }
  listSprints(): readonly Sprint[] { return [...this.sprints.values()]; }
  saveTask(value: Task): void { this.tasks.set(value.id, value); }
  getTask(id: EntityId): Task | undefined { return this.tasks.get(id); }
  listTasks(sprintId?: EntityId): readonly Task[] {
    const values = [...this.tasks.values()];
    return sprintId === undefined ? values : values.filter((task) => task.sprintId === sprintId);
  }
  saveHandoff(value: Handoff): void { this.handoffs.set(value.id, value); }
  getHandoff(id: EntityId): Handoff | undefined { return this.handoffs.get(id); }
  listHandoffs(): readonly Handoff[] { return [...this.handoffs.values()]; }
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
    await this.store.saveSprint(updated);
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
    await this.store.saveSprint(updated);
    await this.record('sprint', updated.id, updated.taskIds, updated.evidenceIds);
    return updated;
  }

  private async transition(id: EntityId, allowed: readonly Sprint['status'][], status: Sprint['status']): Promise<Sprint> {
    const sprint = await this.requireSprint(id);
    if (!allowed.includes(sprint.status)) throw new OrchestrationError(`Invalid sprint transition from ${sprint.status} to ${status}`);
    const updated = this.updated(sprint, { status });
    await this.store.saveSprint(updated);
    await this.record('sprint', updated.id, updated.taskIds, updated.evidenceIds);
    return updated;
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
    validateTokenBudget(input.budget);
    const value: Task = { schemaVersion: CONTRACT_VERSION, createdAt: new Date().toISOString() as ISO8601, updatedAt: new Date().toISOString() as ISO8601, correlationId: input.correlationId ?? `task:${input.objective}`, id: randomUUID() as EntityId, sprintId: input.sprintId, objective: input.objective.trim(), acceptanceCriteria: this.clean(input.acceptanceCriteria), allowedFiles: this.clean(input.allowedFiles), dependencyIds: this.unique(input.dependencyIds), evidenceIds: this.unique(input.evidenceIds), budget: input.budget, status: 'todo' };
    await this.store.saveTask(value);
    await this.sprintEngine.attachTask(input.sprintId, value.id);
    if (this.graph) await this.graph.record({ kind: 'task', id: value.id, relatedIds: [value.sprintId, ...value.dependencyIds], evidenceIds: value.evidenceIds });
    return value;
  }

  async next(sprintId: EntityId): Promise<Task | undefined> {
    const tasks = await this.store.listTasks(sprintId);
    const done = new Set(tasks.filter((task) => task.status === 'done').map((task) => task.id));
    return tasks.filter((task) => task.status === 'todo' && task.dependencyIds.every((dependency) => done.has(dependency))).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  }

  async start(id: EntityId): Promise<Task> {
    const task = await this.require(id);
    const sprint = await this.store.getSprint(task.sprintId);
    if (!sprint || sprint.status !== 'active') throw new OrchestrationError('Task requires an active sprint');
    if (task.status !== 'todo' && task.status !== 'blocked') throw new OrchestrationError(`Invalid task start from ${task.status}`);
    const updated = this.updated(task, { status: 'in_progress' }); await this.store.saveTask(updated); return updated;
  }

  async block(id: EntityId): Promise<Task> { const task = await this.require(id); if (task.status !== 'in_progress') throw new OrchestrationError('Only an in-progress task can be blocked'); const updated = this.updated(task, { status: 'blocked' }); await this.store.saveTask(updated); return updated; }

  async complete(id: EntityId, validator: CompletionValidator): Promise<Task> {
    const task = await this.require(id);
    if (task.status !== 'in_progress') throw new OrchestrationError('Only an in-progress task can be completed');
    const result = await validator.validateTask(task);
    if (result.status !== 'accepted') throw new OrchestrationError(`Task validation did not accept completion: ${result.status}`);
    const evidenceIds = this.unique([...task.evidenceIds, ...result.checks.flatMap((check) => check.evidenceIds)]);
    const updated = this.updated(task, { status: 'done', evidenceIds }); await this.store.saveTask(updated);
    if (this.graph) await this.graph.record({ kind: 'task', id: updated.id, relatedIds: [updated.sprintId, ...updated.dependencyIds], evidenceIds }); return updated;
  }

  private async require(id: EntityId): Promise<Task> { const value = await this.store.getTask(id); if (!value) throw new OrchestrationError(`Task not found: ${id}`); return value; }
  private updated(value: Task, changes: Partial<Task>): Task { return { ...value, ...changes, updatedAt: new Date().toISOString() as ISO8601 }; }
  private clean(values: readonly string[]): readonly string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
  private unique(values: readonly EntityId[]): readonly EntityId[] { return [...new Set(values)]; }
}

export class HandoffEngine {
  private readonly store: OrchestrationStore;
  private readonly graph?: GraphRecorder;
  private readonly maxItems: number;
  private readonly maxItemLength: number;
  constructor(store: OrchestrationStore, graph?: GraphRecorder, maxItems = 20, maxItemLength = 500) { this.store = store; this.graph = graph; this.maxItems = maxItems; this.maxItemLength = maxItemLength; }

  async create(input: CreateHandoffInput): Promise<Handoff> {
    for (const [name, value] of Object.entries({ from: input.from, to: input.to, intent: input.intent, objective: input.objective, nextAgent: input.nextAgent })) if (value.trim().length === 0) throw new OrchestrationError(`Handoff ${name} is required`);
    if (input.acceptance.length === 0) throw new OrchestrationError('Handoff acceptance is required');
    if (input.evidenceIds.length === 0) throw new OrchestrationError('Handoff requires evidence references');
    const fields: AuditShape = { schemaVersion: CONTRACT_VERSION, createdAt: new Date().toISOString() as ISO8601, updatedAt: new Date().toISOString() as ISO8601, correlationId: input.correlationId ?? `handoff:${input.intent}` };
    const value: Handoff = { ...fields, id: randomUUID() as EntityId, from: input.from.trim(), to: input.to.trim(), intent: input.intent.trim(), objective: input.objective.trim(), completedWork: this.compact(input.completedWork), decisions: this.compact(input.decisions), constraints: this.compact(input.constraints), pending: this.compact(input.pending), evidenceIds: [...new Set(input.evidenceIds)], acceptance: this.compact(input.acceptance), blockers: this.compact(input.blockers), nextAgent: input.nextAgent.trim() };
    await this.store.saveHandoff(value);
    if (this.graph) await this.graph.record({ kind: 'handoff', id: value.id, relatedIds: value.evidenceIds, evidenceIds: value.evidenceIds });
    return value;
  }

  private compact(values: readonly string[]): readonly string[] { if (values.length > this.maxItems) throw new OrchestrationError(`Handoff section exceeds ${this.maxItems} items`); const result = [...new Set(values.map((value) => value.trim()).filter(Boolean))]; if (result.some((value) => value.length > this.maxItemLength)) throw new OrchestrationError(`Handoff item exceeds ${this.maxItemLength} characters`); return result; }
}
