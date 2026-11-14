import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { CONTRACT_VERSION, validateTokenBudget, type AgentIdentity, type CapabilityId, type ContextPackage, type EntityId, type ISO8601, type PlanningBudget, type PlanningProposal, type PlanningSnapshot, type TokenBudget } from '../../../packages/contracts/src/index.ts';
import type { CapabilityPolicy } from '../../../packages/core/src/index.ts';
import { ContextEngine, ContextEngineError } from '../../../packages/context/src/index.ts';
import { OrchestrationError, type OrchestrationStore, type TaskEngine } from '../../../packages/orchestration/src/index.ts';
import { DeterministicPlanner } from '../../../packages/planner/src/index.ts';
import { PlanningError, type PlanningStore } from '../../../packages/planner/src/proposal-store.ts';

export interface TaskPlanningDependencies {
  readonly orchestration: OrchestrationStore;
  readonly tasks: TaskEngine;
  readonly context: ContextEngine;
  readonly proposals: PlanningStore;
  readonly policy: CapabilityPolicy;
  readonly executor: AgentIdentity;
  readonly reviewer?: AgentIdentity;
}

export class TaskPlanningService {
  constructor(private readonly dependencies: TaskPlanningDependencies) {}

  async propose(input: unknown): Promise<PlanningProposal> {
    const value = this.object(input, ['taskId', 'handoffId', 'budget', 'correlationId']);
    const taskId = this.string(value.taskId);
    const handoffId = value.handoffId === undefined ? undefined : this.string(value.handoffId);
    const correlationId = value.correlationId === undefined ? randomUUID() : this.string(value.correlationId);
    const snapshot = await this.snapshot(taskId as EntityId, handoffId as EntityId | undefined);
    const budget = this.budget(value.budget, snapshot.task.budget);
    this.authorize('planning.propose', this.dependencies.executor, snapshot, budget);
    await this.eligible(snapshot);
    const proposal = await this.generate(randomUUID() as EntityId, snapshot, budget, correlationId);
    await this.dependencies.proposals.create(proposal);
    return this.find(proposal.id);
  }

  async get(id: unknown): Promise<PlanningProposal> {
    const proposal = await this.find(id);
    this.authorize('planning.get', this.dependencies.executor, proposal.snapshot, proposal.budget.limit);
    return proposal;
  }

  async review(id: unknown, input: unknown): Promise<PlanningProposal> {
    const value = this.object(input, ['decision', 'expectedDigest', 'reason']);
    if (value.decision !== 'approved' && value.decision !== 'rejected') throw new PlanningError('PLANNING_INVALID_INPUT', 'Review decision must be approved or rejected');
    const digest = this.string(value.expectedDigest);
    const reason = this.string(value.reason);
    const reviewer = this.dependencies.reviewer;
    if (reviewer === undefined) throw new PlanningError('PLANNING_REVIEWER_UNAVAILABLE', 'A trusted host reviewer is not configured');
    const proposal = await this.find(id);
    this.authorize('planning.review', reviewer, proposal.snapshot, proposal.budget.limit);
    if (proposal.digest !== digest) throw new PlanningError('PLANNING_CONFLICT', 'The proposal digest does not match');
    if (proposal.review !== undefined) {
      if (proposal.review.decision === value.decision && proposal.review.reason === reason && proposal.review.reviewerId === reviewer.id) return proposal;
      throw new PlanningError('PLANNING_CONFLICT', 'A different review is already recorded');
    }
    if (proposal.status !== 'draft') throw new PlanningError('PLANNING_INVALID_REVIEW', 'Only a draft proposal can be reviewed');
    let snapshot: PlanningSnapshot | undefined;
    let sourcesVerifiedAt: ISO8601 | undefined;
    if (value.decision === 'approved') {
      snapshot = await this.snapshot(proposal.snapshot.task.id, proposal.snapshot.handoff?.id);
      if (canonical(snapshot) !== canonical(proposal.snapshot) || canonical(this.dependencies.executor) !== canonical(proposal.executor)) throw new PlanningError('PLANNING_STALE', 'Task, handoff or executor changed; generate a new proposal');
      await this.eligible(snapshot);
      const current = await this.generate(proposal.id, snapshot, proposal.budget.limit, proposal.correlationId);
      if (current.status !== 'draft' || current.digest !== proposal.digest) throw new PlanningError('PLANNING_STALE', 'Planning sources changed; generate a new proposal');
      sourcesVerifiedAt = new Date().toISOString() as ISO8601;
    }
    const decidedAt = new Date().toISOString() as ISO8601;
    const reviewed: PlanningProposal = { ...proposal, status: value.decision, updatedAt: decidedAt, review: { decision: value.decision, reviewerId: reviewer.id, reason, digest, decidedAt, ...(sourcesVerifiedAt === undefined ? {} : { sourcesVerifiedAt }) } };
    await this.dependencies.proposals.review(proposal, reviewed, snapshot);
    return this.find(proposal.id);
  }

  private async generate(id: EntityId, snapshot: PlanningSnapshot, limit: TokenBudget, correlationId: string): Promise<PlanningProposal> {
    const { task, handoff } = snapshot;
    const acceptanceCriteria = [...new Set([...task.acceptanceCriteria, ...(handoff?.acceptance ?? [])])];
    const briefing = {
      objective: task.objective, acceptanceCriteria, allowedFiles: task.allowedFiles, dependencyIds: task.dependencyIds,
      handoff: handoff === undefined ? undefined : { from: handoff.from, to: handoff.to, nextAgent: handoff.nextAgent, intent: handoff.intent, objective: handoff.objective, completedWork: handoff.completedWork, decisions: handoff.decisions, constraints: handoff.constraints, pending: handoff.pending, blockers: handoff.blockers },
    };
    const briefingTokens = Math.ceil(Buffer.byteLength(canonical(briefing), 'utf8') / 4);
    const inputAvailable = Math.max(0, limit.inputTokens - limit.usedTokens);
    const outputAvailable = Math.max(0, limit.outputTokens - limit.usedTokens);
    const blockers: Array<{ code: string; message: string }> = (handoff?.blockers ?? []).map((message) => ({ code: 'HANDOFF_BLOCKED', message }));
    let context: ContextPackage | undefined;
    if (briefingTokens >= inputAvailable) blockers.push({ code: 'CONTEXT_BUDGET_EXCEEDED', message: 'The mandatory briefing leaves no input budget for evidence' });
    if (blockers.length === 0) {
      const available = inputAvailable - briefingTokens;
      try {
        context = await this.dependencies.context.build({ objective: [task.objective, ...acceptanceCriteria, ...(handoff?.pending ?? [])].join('\n'), budget: { inputTokens: available, outputTokens: 0, totalTokens: available, usedTokens: 0 }, requireEvidence: true, includeContent: true, includeProvenanceInBudget: true, maxItems: 20, correlationId });
        if (context.items === undefined || context.items.length === 0) throw new ContextEngineError('INSUFFICIENT_EVIDENCE', 'The context source did not provide item provenance');
      } catch (error: unknown) {
        if (!(error instanceof ContextEngineError) || !['INSUFFICIENT_EVIDENCE', 'CONTEXT_BUDGET_EXCEEDED'].includes(error.code)) throw error;
        blockers.push({ code: error.code, message: error.message });
      }
    }
    const contextTokens = context?.metrics.selectedTokens ?? 0;
    const allocatedInput = Math.max(0, inputAvailable - briefingTokens - contextTokens);
    const allocation: TokenBudget = { inputTokens: allocatedInput, outputTokens: outputAvailable, totalTokens: allocatedInput + outputAvailable, usedTokens: 0 };
    const budget: PlanningBudget = { limit, briefingTokens, contextTokens, allocation };
    const plan = blockers.length > 0 || context === undefined ? undefined : new DeterministicPlanner().plan({
      planId: id, objective: task.objective, acceptanceCriteria, allowedFiles: task.allowedFiles, dependencyIds: task.dependencyIds,
      evidenceIds: context.references.map((evidence) => evidence.id), contextItems: context.items, constraints: handoff?.constraints ?? [], decisions: handoff?.decisions ?? [], pending: handoff?.pending ?? [], budget: allocation, correlationId,
    });
    const now = new Date().toISOString() as ISO8601;
    const digest = createHash('sha256').update(canonical({ snapshot, executor: this.dependencies.executor, budget, plan, items: context?.items, blockers }, true)).digest('hex');
    return { schemaVersion: CONTRACT_VERSION, id, version: 1, createdAt: now, updatedAt: now, correlationId, digest, executor: { ...this.dependencies.executor }, snapshot, status: blockers.length > 0 ? 'blocked' : 'draft', plan, context, budget, blockers, declaredEvidenceIds: [...new Set([...task.evidenceIds, ...(handoff?.evidenceIds ?? [])])] };
  }

  private async snapshot(taskId: EntityId, handoffId?: EntityId): Promise<PlanningSnapshot> {
    const task = await this.dependencies.orchestration.getTask(taskId);
    if (task === undefined) throw new PlanningError('PLANNING_NOT_FOUND', 'Task not found');
    const sprint = await this.dependencies.orchestration.getSprint(task.sprintId);
    if (sprint === undefined) throw new PlanningError('PLANNING_INVALID_SCOPE', 'Task sprint is missing');
    const handoff = handoffId === undefined ? undefined : await this.dependencies.orchestration.getHandoff(handoffId);
    if (handoffId !== undefined && (handoff === undefined || handoff.taskId !== task.id || handoff.runId !== undefined || handoff.status !== 'pending' || handoff.nextAgent !== this.dependencies.executor.id)) throw new PlanningError('PLANNING_INVALID_SCOPE', 'Handoff does not match the task and host executor');
    const dependencies = [];
    for (const id of task.dependencyIds) {
      const dependency = await this.dependencies.orchestration.getTask(id);
      if (dependency === undefined) throw new PlanningError('PLANNING_INVALID_SCOPE', 'Task dependency is missing');
      dependencies.push(dependency);
    }
    return JSON.parse(JSON.stringify({ task, sprint, dependencies, ...(handoff === undefined ? {} : { handoff }) })) as PlanningSnapshot;
  }

  private async eligible(snapshot: PlanningSnapshot): Promise<void> {
    const { task } = snapshot;
    if ((task.status !== 'todo' && task.status !== 'in_progress') || task.runtimeRunId !== undefined) throw new PlanningError('PLANNING_INVALID_SCOPE', 'Planning requires an open, unbound task');
    if (task.allowedFiles.some((file) => file !== '*' && (file.length === 0 || file.includes('\\') || path.posix.isAbsolute(file) || file.split('/').includes('..') || path.posix.normalize(file) !== file))) throw new PlanningError('PLANNING_INVALID_SCOPE', 'Task file scope must use normalized relative paths');
    try { await this.dependencies.tasks.assertEligible(task); }
    catch (error: unknown) {
      if (!(error instanceof OrchestrationError)) throw error;
      throw new PlanningError('PLANNING_INVALID_SCOPE', 'The task is not eligible in its sprint');
    }
  }

  private authorize(action: 'planning.propose' | 'planning.get' | 'planning.review', actor: AgentIdentity, snapshot: PlanningSnapshot, budget: TokenBudget): void {
    const category = action === 'planning.get' ? 'read' : 'write';
    const now = new Date().toISOString() as ISO8601;
    const decision = this.dependencies.policy.authorize({ agent: actor, input: { capabilityId: action as CapabilityId, payload: { taskId: snapshot.task.id, handoffId: snapshot.handoff?.id } }, environment: 'local', files: snapshot.task.allowedFiles, categories: [category], budget, now, definition: { schemaVersion: CONTRACT_VERSION, createdAt: now, updatedAt: now, correlationId: action, id: action as CapabilityId, version: '1.0.0', description: action, permissions: [category], risk: category === 'read' ? 'low' : 'medium', sideEffects: category === 'read' ? [] : ['planning-proposal'], requirements: [], supportsAutonomy: false, idempotent: category === 'read', timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [] } });
    if (decision.effect !== 'ALLOW' && decision.effect !== 'ALLOW_WITH_LIMITS') throw new PlanningError('PLANNING_DENIED', 'Policy does not permit this planning action');
    for (const [key, limit] of Object.entries(decision.limits ?? {})) {
      if (!Number.isFinite(limit) || limit < 0 || (key !== 'maxTokens' && key !== 'maxFiles')) throw new PlanningError('PLANNING_DENIED', 'Policy contains an unsupported planning limit');
      if ((key === 'maxTokens' && budget.totalTokens > limit) || (key === 'maxFiles' && (snapshot.task.allowedFiles.some((file) => file === '*' || file.endsWith('/')) || snapshot.task.allowedFiles.length > limit))) throw new PlanningError('PLANNING_DENIED', 'Planning scope exceeds policy limits');
    }
  }

  private budget(value: unknown, ceiling: TokenBudget): TokenBudget {
    const budget = value === undefined ? ceiling : this.object(value, ['inputTokens', 'outputTokens', 'totalTokens', 'usedTokens']);
    for (const field of ['inputTokens', 'outputTokens', 'totalTokens', 'usedTokens'] as const) if (!Number.isSafeInteger(budget[field])) throw new PlanningError('PLANNING_INVALID_INPUT', 'Budget values must be safe integers');
    try { validateTokenBudget(budget as unknown as TokenBudget); }
    catch { throw new PlanningError('PLANNING_INVALID_INPUT', 'Budget is inconsistent'); }
    const result = budget as unknown as TokenBudget;
    if (result.inputTokens > ceiling.inputTokens || result.outputTokens > ceiling.outputTokens || result.totalTokens > ceiling.totalTokens || result.usedTokens < ceiling.usedTokens) throw new PlanningError('PLANNING_INVALID_INPUT', 'Planning budget cannot expand the task budget or erase consumption');
    return { ...result };
  }

  private async find(value: unknown): Promise<PlanningProposal> {
    const proposal = await this.dependencies.proposals.get(this.string(value) as EntityId);
    if (proposal === undefined) throw new PlanningError('PLANNING_NOT_FOUND', 'Planning proposal not found');
    return proposal;
  }

  private string(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) throw new PlanningError('PLANNING_INVALID_INPUT', 'Expected a nonempty string');
    return value;
  }

  private object(value: unknown, fields: readonly string[]): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some((key) => !fields.includes(key))) throw new PlanningError('PLANNING_INVALID_INPUT', 'Unexpected planning input fields');
    return value as Record<string, unknown>;
  }
}

function canonical(value: unknown, omitAudit = false): string {
  return JSON.stringify(value, (key, item: unknown) => {
    if (omitAudit && ['createdAt', 'updatedAt', 'correlationId'].includes(key)) return undefined;
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
    return item;
  });
}
