import { randomUUID } from 'node:crypto';
import type { AuditRecord, Checkpoint, DomainEvent, EntityId, Handoff, ISO8601, Observation, RuntimeRun, SandboxSession, Sprint, Task, RunId } from '../../contracts/src/index.ts';
import type { EventStore } from '../../events/src/index.ts';
import type { CheckpointStore } from '../../runtime/src/index.ts';
import type { OrchestrationStore } from '../../orchestration/src/index.ts';
import type { SandboxStore } from '../../sandbox/src/index.ts';
import type { ObservationStore } from '../../observability/src/index.ts';

export interface SqliteStatement {
  run(...parameters: readonly unknown[]): { readonly changes?: number; readonly lastInsertRowid?: number | bigint };
  get(...parameters: readonly unknown[]): unknown;
  all(...parameters: readonly unknown[]): readonly unknown[];
}

export interface SqliteConnection {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'core-persistence',
    sql: `CREATE TABLE IF NOT EXISTS forja_records (collection TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (collection, id));
CREATE TABLE IF NOT EXISTS forja_events (id TEXT PRIMARY KEY, aggregate_id TEXT NOT NULL, sequence INTEGER NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS forja_audit (id TEXT PRIMARY KEY, aggregate_id TEXT NOT NULL, action TEXT NOT NULL, outcome TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);`,
  },
];

export class SqliteAdapterError extends Error {
  constructor(message: string) { super(message); this.name = 'SqliteAdapterError'; }
}

export class SqliteMigrationRunner {
  private readonly db: SqliteConnection;
  private readonly migrations: readonly Migration[];
  constructor(db: SqliteConnection, migrations: readonly Migration[] = MIGRATIONS) { this.db = db; this.migrations = [...migrations].sort((a, b) => a.version - b.version); }

  apply(): readonly number[] {
    this.db.exec('CREATE TABLE IF NOT EXISTS forja_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);');
    const rows = this.db.prepare('SELECT version FROM forja_schema_migrations ORDER BY version').all();
    const applied = new Set(rows.map((row) => this.numberField(row, 'version')));
    const executed: number[] = [];
    for (const migration of this.migrations) {
      if (applied.has(migration.version)) continue;
      if (!Number.isInteger(migration.version) || migration.version < 1) throw new SqliteAdapterError(`Invalid migration version: ${migration.version}`);
      this.db.exec(migration.sql);
      this.db.prepare('INSERT INTO forja_schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(migration.version, migration.name, new Date().toISOString());
      executed.push(migration.version);
    }
    return executed;
  }

  private numberField(row: unknown, field: string): number { if (!isRecord(row) || typeof row[field] !== 'number') throw new SqliteAdapterError(`Invalid migration row: ${field}`); return row[field]; }
}

export class SqliteJsonRepository {
  private readonly db: SqliteConnection;
  constructor(db: SqliteConnection) { this.db = db; }

  put(collection: string, id: string, value: unknown, updatedAt: string): void {
    this.db.prepare('INSERT INTO forja_records (collection, id, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at').run(collection, id, JSON.stringify(value), updatedAt);
  }

  get<T>(collection: string, id: string): T | undefined {
    const row = this.db.prepare('SELECT payload FROM forja_records WHERE collection = ? AND id = ?').get(collection, id);
    if (!isRecord(row) || typeof row.payload !== 'string') return undefined;
    return JSON.parse(row.payload) as T;
  }

  list<T>(collection: string): readonly T[] {
    return this.db.prepare('SELECT payload FROM forja_records WHERE collection = ? ORDER BY updated_at').all(collection).flatMap((row) => isRecord(row) && typeof row.payload === 'string' ? [JSON.parse(row.payload) as T] : []);
  }
}

export class SqliteOrchestrationStore implements OrchestrationStore {
  private readonly repository: SqliteJsonRepository;
  constructor(db: SqliteConnection) { this.repository = new SqliteJsonRepository(db); }
  saveSprint(value: Sprint): void { this.repository.put('sprint', value.id, value, value.updatedAt); }
  getSprint(id: EntityId): Sprint | undefined { return this.repository.get<Sprint>('sprint', id); }
  listSprints(): readonly Sprint[] { return this.repository.list<Sprint>('sprint'); }
  saveTask(value: Task): void { this.repository.put('task', value.id, value, value.updatedAt); }
  getTask(id: EntityId): Task | undefined { return this.repository.get<Task>('task', id); }
  listTasks(sprintId?: EntityId): readonly Task[] { const tasks = this.repository.list<Task>('task'); return sprintId === undefined ? tasks : tasks.filter((task) => task.sprintId === sprintId); }
  saveHandoff(value: Handoff): void { this.repository.put('handoff', value.id, value, value.updatedAt); }
  getHandoff(id: EntityId): Handoff | undefined { return this.repository.get<Handoff>('handoff', id); }
  listHandoffs(): readonly Handoff[] { return this.repository.list<Handoff>('handoff'); }
}

export class SqliteSandboxStore implements SandboxStore {
  private readonly repository: SqliteJsonRepository;
  constructor(db: SqliteConnection) { this.repository = new SqliteJsonRepository(db); }
  save(value: SandboxSession): void { this.repository.put('sandbox', value.id, value, value.updatedAt); }
  get(id: EntityId): SandboxSession | undefined { return this.repository.get<SandboxSession>('sandbox', id); }
}

export class SqliteCheckpointStore implements CheckpointStore {
  private readonly repository: SqliteJsonRepository;
  constructor(db: SqliteConnection) { this.repository = new SqliteJsonRepository(db); }
  save(value: Checkpoint): void { this.repository.put('checkpoint', value.runId, value, value.updatedAt); }
  get(runId: RunId): Checkpoint | undefined { return this.repository.get<Checkpoint>('checkpoint', runId); }
}

export class SqliteEventStore implements EventStore {
  private readonly db: SqliteConnection;
  constructor(db: SqliteConnection) { this.db = db; }
  append(event: DomainEvent): void { this.db.prepare('INSERT OR IGNORE INTO forja_events (id, aggregate_id, sequence, type, payload, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(event.id, event.aggregateId, event.sequence, event.type, JSON.stringify(event.payload), event.idempotencyKey, event.createdAt); }
  list(): readonly DomainEvent[] { return this.db.prepare('SELECT id, aggregate_id, sequence, type, payload, idempotency_key, created_at FROM forja_events ORDER BY aggregate_id, sequence').all().flatMap((row) => this.eventFrom(row)); }
  private eventFrom(row: unknown): readonly DomainEvent[] { if (!isRecord(row) || typeof row.id !== 'string' || typeof row.aggregate_id !== 'string' || typeof row.sequence !== 'number' || typeof row.type !== 'string' || typeof row.payload !== 'string' || typeof row.idempotency_key !== 'string' || typeof row.created_at !== 'string') return []; return [{ schemaVersion: '2.0', id: row.id as EntityId, aggregateId: row.aggregate_id as EntityId, sequence: row.sequence, type: row.type, payload: JSON.parse(row.payload), idempotencyKey: row.idempotency_key, correlationId: row.idempotency_key, createdAt: row.created_at as ISO8601, updatedAt: row.created_at as ISO8601 }]; }
}

export class SqliteRuntimeRunStore {
  private readonly repository: SqliteJsonRepository;
  constructor(db: SqliteConnection) { this.repository = new SqliteJsonRepository(db); }
  save(value: RuntimeRun): void { this.repository.put('runtime_run', value.runId, value, value.updatedAt); }
  get(runId: RunId): RuntimeRun | undefined { return this.repository.get<RuntimeRun>('runtime_run', runId); }
}

export class SqliteObservationStore implements ObservationStore {
  private readonly repository: SqliteJsonRepository;
  constructor(db: SqliteConnection) { this.repository = new SqliteJsonRepository(db); }
  append(value: Observation): void { this.repository.put('observation', value.id, value, value.updatedAt); }
  list(): readonly Observation[] { return this.repository.list<Observation>('observation'); }
}

export class SqliteAuditStore {
  private readonly db: SqliteConnection;
  constructor(db: SqliteConnection) { this.db = db; }
  append(value: AuditRecord): void { this.db.prepare('INSERT OR IGNORE INTO forja_audit (id, aggregate_id, action, outcome, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(value.id, value.aggregateId, value.action, value.outcome, JSON.stringify(value), value.createdAt); }
  list(): readonly AuditRecord[] { return this.db.prepare('SELECT payload FROM forja_audit ORDER BY created_at, id').all().flatMap((row) => isRecord(row) && typeof row.payload === 'string' ? [JSON.parse(row.payload) as AuditRecord] : []); }
}

export function createAuditRecord(input: { readonly action: string; readonly aggregateId: EntityId; readonly outcome: AuditRecord['outcome']; readonly evidenceIds: readonly EntityId[]; readonly details?: Readonly<Record<string, string>>; readonly correlationId?: string }): AuditRecord {
  const now = new Date().toISOString() as ISO8601;
  return { schemaVersion: '2.0', id: randomUUID() as EntityId, action: input.action, aggregateId: input.aggregateId, outcome: input.outcome, evidenceIds: [...input.evidenceIds], details: input.details ?? {}, correlationId: input.correlationId ?? input.action, createdAt: now, updatedAt: now };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
