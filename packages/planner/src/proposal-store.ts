import type { EntityId, Handoff, PlanningProposal, PlanningSnapshot, Sprint, Task } from '../../contracts/src/index.ts';

export class PlanningError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'PlanningError'; this.code = code; }
}

/** Local synchronous reads are required for the final snapshot check and write. */
export interface PlanningSnapshotReader {
  getTask(id: EntityId): Task | undefined;
  getSprint(id: EntityId): Sprint | undefined;
  getHandoff(id: EntityId): Handoff | undefined;
}

export interface PlanningStore {
  create(proposal: PlanningProposal): void | Promise<void>;
  get(id: EntityId): PlanningProposal | undefined | Promise<PlanningProposal | undefined>;
  review(before: PlanningProposal, after: PlanningProposal, expectedSnapshot?: PlanningSnapshot): void | Promise<void>;
}

/** Shared JSON semantics for both persistence implementations, including optional undefined fields. */
export function clonePlanningValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function canonical(value: unknown): string | undefined {
  const normalized = clonePlanningValue(value);
  function sort(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(sort);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, sort(child)]));
    }
    return item;
  }
  return JSON.stringify(sort(normalized));
}

function equal(left: unknown, right: unknown): boolean { return canonical(left) === canonical(right); }
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }

function synchronous<T>(value: T): T {
  if (value !== null && (typeof value === 'object' || typeof value === 'function') && 'then' in value && typeof value.then === 'function') {
    // Surface the contract violation synchronously, while observing an accidental rejection.
    void Promise.resolve(value).catch(() => undefined);
    throw new PlanningError('PLANNING_STALE', 'Planning snapshot readers must be synchronous');
  }
  return value;
}

export function assertPlanningSnapshot(snapshot: PlanningSnapshot, reader: PlanningSnapshotReader): void {
  const { task, sprint, dependencies, handoff } = snapshot;
  const ids = new Set(dependencies.map(dependency => dependency.id));
  if (task.sprintId !== sprint.id || ids.size !== dependencies.length || ids.size !== task.dependencyIds.length
    || task.dependencyIds.some(id => !ids.has(id))
    || (handoff !== undefined && handoff.taskId !== task.id)
    || (task.handoffId !== undefined && task.handoffId !== handoff?.id)) {
    throw new PlanningError('PLANNING_STALE', 'Planning snapshot relationships do not match');
  }
  if (!equal(synchronous(reader.getTask(task.id)), task)
    || !equal(synchronous(reader.getSprint(sprint.id)), sprint)
    || (handoff !== undefined && !equal(synchronous(reader.getHandoff(handoff.id)), handoff))
    || dependencies.some(dependency => !equal(synchronous(reader.getTask(dependency.id)), dependency))) {
    throw new PlanningError('PLANNING_STALE', 'Planning snapshot no longer matches current records');
  }
}

export function assertPlanningCreate(proposal: PlanningProposal, current: PlanningProposal | undefined, reader: PlanningSnapshotReader): void {
  if (current !== undefined) throw new PlanningError('PLANNING_CONFLICT', 'Planning proposal already exists');
  if (!nonempty(proposal.id) || proposal.version !== 1 || !nonempty(proposal.digest)
    || (proposal.status !== 'draft' && proposal.status !== 'blocked') || proposal.review !== undefined) {
    throw new PlanningError('PLANNING_INVALID_REVIEW', 'A new planning proposal must be an unreviewed draft or blocked proposal');
  }
  assertPlanningSnapshot(proposal.snapshot, reader);
}

function immutableContent(proposal: PlanningProposal): unknown {
  const { status: _status, review: _review, updatedAt: _updatedAt, ...content } = proposal;
  return content;
}

function reviewContent(proposal: PlanningProposal): unknown {
  if (proposal.review === undefined) return undefined;
  const { decidedAt: _decidedAt, sourcesVerifiedAt: _sourcesVerifiedAt, ...content } = proposal.review;
  return content;
}

/** Returns false for an already committed equivalent review, preserving its historical timestamps. */
export function assertPlanningReview(
  before: PlanningProposal,
  after: PlanningProposal,
  current: PlanningProposal | undefined,
  expectedSnapshot: PlanningSnapshot | undefined,
  reader: PlanningSnapshotReader,
): boolean {
  const review = after.review;
  if (!equal(immutableContent(before), immutableContent(after)) || before.digest !== after.digest
    || before.status !== 'draft' || before.review !== undefined
    || (after.status !== 'approved' && after.status !== 'rejected')
    || review === undefined || review.decision !== after.status || review.digest !== after.digest
    || !nonempty(review.reviewerId) || !nonempty(review.reason) || !nonempty(review.decidedAt)) {
    throw new PlanningError('PLANNING_INVALID_REVIEW', 'Review must preserve proposal content and decide an unreviewed draft');
  }
  if (current === undefined) throw new PlanningError('PLANNING_CONFLICT', 'Planning proposal does not exist');
  if (current.status === after.status && equal(immutableContent(current), immutableContent(before))
    && equal(reviewContent(current), reviewContent(after))) return false;
  if (!equal(current, before)) throw new PlanningError('PLANNING_CONFLICT', 'Planning proposal changed before review');
  if (after.status === 'approved') {
    if (expectedSnapshot === undefined || !equal(expectedSnapshot, before.snapshot)) {
      throw new PlanningError('PLANNING_INVALID_REVIEW', 'Approval requires the proposal snapshot as a precondition');
    }
    assertPlanningSnapshot(expectedSnapshot, reader);
  }
  return true;
}

export class InMemoryPlanningStore implements PlanningStore {
  private readonly proposals = new Map<EntityId, PlanningProposal>();
  private readonly reader: PlanningSnapshotReader;
  constructor(reader: PlanningSnapshotReader) { this.reader = reader; }

  create(proposal: PlanningProposal): void {
    const next = clonePlanningValue(proposal);
    assertPlanningCreate(next, this.proposals.get(next.id), this.reader);
    this.proposals.set(next.id, next);
  }

  get(id: EntityId): PlanningProposal | undefined { return clonePlanningValue(this.proposals.get(id)); }

  review(before: PlanningProposal, after: PlanningProposal, expectedSnapshot?: PlanningSnapshot): void {
    const previous = clonePlanningValue(before);
    const next = clonePlanningValue(after);
    const expected = clonePlanningValue(expectedSnapshot);
    if (assertPlanningReview(previous, next, this.proposals.get(previous.id), expected, this.reader)) {
      this.proposals.set(next.id, next);
    }
  }
}
