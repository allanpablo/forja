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
  rollback(session: SandboxSession): void | Promise<void>;
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

  async rollback(id: EntityId, diff: SandboxDiff): Promise<SandboxSession> {
    const session = await this.require(id); this.requireState(session, ['promoted']);
    if (diff.sessionId !== id || diff.checksum.length === 0) throw new SandboxError('Rollback requires a valid diff for the same sandbox');
    await this.backend.rollback(session);
    const updated = this.updated(session, { state: 'rolled_back', promoted: false });
    await this.store.save(updated);
    return updated;
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

export interface SandboxedCapabilityOptions<T> {
  readonly sandbox: SandboxEngine;
  readonly runId: RunId;
  /** Directory the isolated worktree/copy is created at — never the live project root. */
  readonly root: string;
  readonly backend?: SandboxSession['backend'];
  readonly correlationId?: string;
  /**
   * Does the actual work: write files under `session.root` (never outside it), and run whatever
   * verification the capability needs via `sandbox.execute(session.id, ...)` on the same instance
   * passed in `options.sandbox`. Its return value is threaded through untouched as `workResult`.
   */
  readonly work: (session: SandboxSession) => T | Promise<T>;
}

export type SandboxedCapabilityOutcome = 'promoted' | 'rejected' | 'failed';

export interface SandboxedCapabilityResult<T> {
  readonly session: SandboxSession;
  readonly outcome: SandboxedCapabilityOutcome;
  readonly workResult?: T;
  readonly validation?: SandboxValidation;
  readonly diff?: SandboxDiff;
  readonly error?: unknown;
}

/**
 * The create→prepare→work→validate→diff→promote(-or-reject/rollback)→destroy lifecycle, as a
 * single call instead of hand-rolled per call site. Extracted from `scripts/demo-autonomy.ts`,
 * which proved the pattern for one capability (`fixture.code.write`) — this is that same pattern
 * made reusable, so a future capability that edits real project files has a paved, tested path to
 * real isolation instead of either reinventing this state machine or (as every capability
 * registered in `apps/cli/src/index.ts` does today) skipping isolation entirely because none of
 * them currently write to project source — see docs/security/2026-08-31 audit for why that's
 * currently fine and when it stops being fine: the moment a capability's handler starts writing
 * to arbitrary project files, it needs to go through this, not straight `fs`/`spawnSync` on the
 * live tree.
 *
 * Always destroys the session before returning, on every outcome — a caller never has to remember
 * cleanup. Never throws for a rejected/failed *validation* (that's a normal outcome, reported via
 * the return value); only rethrows if `options.work` itself throws, after best-effort cleanup.
 *
 * `options.work` must call `sandbox.execute(session.id, ...)` (on the same `sandbox` passed in
 * `options.sandbox`) at least once before returning: `SandboxEngine.validate()` requires the
 * session to already be in the `'validating'` state, and only `execute()` puts it there — this
 * mirrors `demo-autonomy.ts`'s own capability handler, which always runs its verification command
 * (`npm test` in the worktree) before considering the edit done. Writing files without ever
 * calling `execute()` is a caller error, not something this helper can validate away.
 */
export async function runSandboxedCapability<T>(options: SandboxedCapabilityOptions<T>): Promise<SandboxedCapabilityResult<T>> {
  const { sandbox } = options;
  const session = await sandbox.create({ runId: options.runId, root: options.root, backend: options.backend, correlationId: options.correlationId });
  try {
    await sandbox.prepare(session.id);
    const workResult = await options.work(session);
    const validation = await sandbox.validate(session.id);
    if (validation.status !== 'accepted') {
      // `validate()` already moved the session to 'rejected' when validation.status is itself
      // 'rejected'; for 'blocked'/'inconclusive' it stays 'validating', so reject() is still a
      // valid transition. Try it either way and ignore the "already rejected" case.
      try { await sandbox.reject(session.id); } catch { /* already in a terminal reject state */ }
      const destroyed = await sandbox.destroy(session.id);
      return { session: destroyed, outcome: 'rejected', workResult, validation };
    }
    const diff = await sandbox.diff(session.id);
    await sandbox.promote(session.id, diff);
    const destroyed = await sandbox.destroy(session.id);
    return { session: destroyed, outcome: 'promoted', workResult, validation, diff };
  } catch (error) {
    try { await sandbox.reject(session.id); } catch { /* already in a terminal reject state */ }
    let destroyed = session;
    try { destroyed = await sandbox.destroy(session.id); } catch { /* best-effort — nothing more we can do */ }
    return { session: destroyed, outcome: 'failed', error };
  }
}
