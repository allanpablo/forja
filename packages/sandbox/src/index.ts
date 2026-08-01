import { createHash, randomUUID } from 'node:crypto';
import {
  CONTRACT_VERSION,
  type EntityId,
  type EvaluationResult,
  type ISO8601,
  type RunId,
  type SandboxCommand,
  type SandboxDiff,
  type SandboxExecution,
  type SandboxSession,
  type SandboxState,
} from '../../contracts/src/index.ts';

export interface SandboxStore {
  save(session: SandboxSession): void | Promise<void>;
  get(id: EntityId): SandboxSession | undefined | Promise<SandboxSession | undefined>;
}

export interface SandboxValidation {
  readonly status: EvaluationResult['status'];
  readonly evidenceIds: readonly EntityId[];
  readonly summary: string;
}

export interface SandboxDiffData {
  readonly files: readonly string[];
  readonly additions: number;
  readonly deletions: number;
  readonly evidenceIds: readonly EntityId[];
}

export interface SandboxBackend {
  create(session: SandboxSession): void | Promise<void>;
  prepare(session: SandboxSession): void | Promise<void>;
  execute(session: SandboxSession, command: SandboxCommand): SandboxCommandResult | Promise<SandboxCommandResult>;
  validate(session: SandboxSession): SandboxValidation | Promise<SandboxValidation>;
  diff(session: SandboxSession): SandboxDiffData | Promise<SandboxDiffData>;
  promote(session: SandboxSession): void | Promise<void>;
  reject(session: SandboxSession): void | Promise<void>;
  destroy(session: SandboxSession): void | Promise<void>;
}

export interface SandboxCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly evidenceIds?: readonly EntityId[];
}

export class SandboxError extends Error {
  constructor(message: string) { super(message); this.name = 'SandboxError'; }
}

export class InMemorySandboxStore implements SandboxStore {
  private readonly sessions = new Map<EntityId, SandboxSession>();
  save(session: SandboxSession): void { this.sessions.set(session.id, session); }
  get(id: EntityId): SandboxSession | undefined { return this.sessions.get(id); }
}

export class SandboxEngine {
  private readonly store: SandboxStore;
  private readonly backend: SandboxBackend;

  constructor(store: SandboxStore, backend: SandboxBackend) { this.store = store; this.backend = backend; }

  async create(input: { readonly runId: RunId; readonly root: string; readonly backend?: SandboxSession['backend']; readonly correlationId?: string }): Promise<SandboxSession> {
    if (input.root.trim().length === 0) throw new SandboxError('Sandbox root is required');
    const session = this.audit<SandboxSession>(input.correlationId ?? `sandbox:${input.runId}`, {
      id: randomUUID() as EntityId, runId: input.runId, backend: input.backend ?? 'git_worktree', root: input.root,
      state: 'created', promoted: false,
    });
    try { await this.backend.create(session); await this.store.save(session); return session; }
    catch (error) { const failed = this.updated(session, { state: 'failed' }); await this.store.save(failed); throw error; }
  }

  async prepare(id: EntityId): Promise<SandboxSession> {
    const session = await this.require(id); this.requireState(session, ['created']);
    await this.backend.prepare(session); const updated = this.updated(session, { state: 'prepared' }); await this.store.save(updated); return updated;
  }

  async execute(id: EntityId, command: SandboxCommand): Promise<SandboxExecution> {
    const session = await this.require(id); this.requireState(session, ['prepared']);
    if (command.executable.trim().length === 0) throw new SandboxError('Sandbox command executable is required');
    const running = this.updated(session, { state: 'executing' }); await this.store.save(running);
    try {
      const result = await this.backend.execute(running, command);
      const validating = this.updated(running, { state: 'validating' }); await this.store.save(validating);
      return this.audit<SandboxExecution>(`execution:${id}:${command.executable}`, { sessionId: id, command, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, durationMs: result.durationMs, evidenceIds: [...(result.evidenceIds ?? [])] });
    } catch (error) { await this.store.save(this.updated(running, { state: 'failed' })); throw error; }
  }

  async validate(id: EntityId): Promise<SandboxValidation> {
    const session = await this.require(id); this.requireState(session, ['validating']);
    const result = await this.backend.validate(session);
    const nextState: SandboxState = result.status === 'accepted' ? 'ready_to_promote' : result.status === 'rejected' ? 'rejected' : 'validating';
    await this.store.save(this.updated(session, { state: nextState })); return result;
  }

  async diff(id: EntityId): Promise<SandboxDiff> {
    const session = await this.require(id); this.requireState(session, ['ready_to_promote']);
    const result = await this.backend.diff(session);
    const evidenceIds = [...result.evidenceIds];
    return this.audit<SandboxDiff>(`diff:${id}:${result.files.join(',')}`, { sessionId: id, checksum: this.checksum(result), files: [...result.files], additions: result.additions, deletions: result.deletions, evidenceIds });
  }

  async promote(id: EntityId, diff: SandboxDiff): Promise<SandboxSession> {
    const session = await this.require(id); this.requireState(session, ['ready_to_promote']);
    if (diff.sessionId !== id || diff.checksum.length === 0) throw new SandboxError('Promotion requires a valid diff for the same sandbox');
    await this.backend.promote(session); const updated = this.updated(session, { state: 'promoted', promoted: true }); await this.store.save(updated); return updated;
  }

  async reject(id: EntityId): Promise<SandboxSession> {
    const session = await this.require(id); this.requireState(session, ['created', 'prepared', 'executing', 'validating', 'ready_to_promote', 'failed']);
    await this.backend.reject(session); const updated = this.updated(session, { state: 'rejected' }); await this.store.save(updated); return updated;
  }

  async destroy(id: EntityId): Promise<SandboxSession> {
    const session = await this.require(id); if (session.state === 'destroyed') return session;
    await this.backend.destroy(session); const updated = this.updated(session, { state: 'destroyed' }); await this.store.save(updated); return updated;
  }

  private async require(id: EntityId): Promise<SandboxSession> { const value = await this.store.get(id); if (!value) throw new SandboxError(`Sandbox not found: ${id}`); return value; }
  private requireState(session: SandboxSession, allowed: readonly SandboxState[]): void { if (!allowed.includes(session.state)) throw new SandboxError(`Invalid sandbox transition from ${session.state}`); }
  private updated(value: SandboxSession, changes: Partial<SandboxSession>): SandboxSession { return { ...value, ...changes, updatedAt: new Date().toISOString() as ISO8601 }; }
  private checksum(value: SandboxDiffData): string { return createHash('sha256').update(JSON.stringify({ files: [...value.files].sort(), additions: value.additions, deletions: value.deletions, evidenceIds: [...value.evidenceIds].sort() })).digest('hex'); }
  private audit<T extends SandboxSession | SandboxExecution | SandboxDiff>(correlationId: string, value: Omit<T, 'schemaVersion' | 'createdAt' | 'updatedAt' | 'correlationId'>): T { const now = new Date().toISOString() as ISO8601; return { ...value, schemaVersion: CONTRACT_VERSION, createdAt: now, updatedAt: now, correlationId } as T; }
}
