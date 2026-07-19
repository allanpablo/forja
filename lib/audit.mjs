/**
 * lib/audit.mjs — a trilha de auditoria como dado consultável (SPEC-014).
 *
 * O core grava toda execução em `.context/forja-runs.jsonl` (ADR-0020): `{ts, cmd, args, exitCode,
 * durationMs}`, uma linha por run. É o dado mais rico de governança do framework — e era write-only.
 *
 * Aqui ele vira consultável, sem deixar de ser resiliente: o `.jsonl` continua a **fonte de
 * verdade** append-only (sobrevive ao banco morto, ADR-0021); a tabela `audit_runs` é uma
 * **projeção reconstruível** por `syncAudit`. Idempotência por `line_hash` (hash do conteúdo da
 * linha): re-sincronizar não duplica, e truncar/reescrever o log não corrompe a tabela.
 *
 * Puro e com `env` injetável — os testes rodam sobre um jsonl de fixture, sem tocar o workspace.
 */

import fs from 'node:fs';
import { createHash } from 'node:crypto';

import { getWorkspaceDbPath, getWorkspaceContextDir } from './workspace.mjs';

/** @typedef {{ ts: string, cmd: string, args: string[], exitCode: number, durationMs: number }} Run */

/** @returns {{ fs: typeof fs, dbPath: string, jsonlPath: string }} */
export function defaultEnv(overrides = {}) {
  return {
    fs,
    dbPath: getWorkspaceDbPath(),
    jsonlPath: `${getWorkspaceContextDir()}/forja-runs.jsonl`,
    ...overrides,
  };
}

function lineHash(line) {
  return createHash('sha1').update(line).digest('hex');
}

async function openDb(env) {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(env.dbPath);
  // Auto-suficiente: cria a própria tabela no db que abre. Idempotente, e desacopla o audit do
  // ensureSchema do workspace — é o que torna a lógica testável contra um db temporário.
  db.exec(
    `CREATE TABLE IF NOT EXISTS audit_runs (
       line_hash TEXT PRIMARY KEY, ts TEXT, cmd TEXT, args TEXT,
       exit_code INTEGER, duration_ms INTEGER
     )`
  );
  return db;
}

/**
 * Ingere o `.jsonl` na tabela `audit_runs`. Idempotente (INSERT OR IGNORE por line_hash).
 * Linha malformada é pulada — um log corrompido no meio não impede o resto.
 *
 * @returns {Promise<{ ingested: number, total: number, skipped: number }>}
 */
export async function syncAudit(env = defaultEnv()) {
  if (!env.fs.existsSync(env.jsonlPath)) {
    return { ingested: 0, total: 0, skipped: 0 };
  }

  const lines = env.fs.readFileSync(env.jsonlPath, 'utf8').split('\n').filter((l) => l.trim());
  const db = await openDb(env);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO audit_runs (line_hash, ts, cmd, args, exit_code, duration_ms)
     VALUES (@line_hash, @ts, @cmd, @args, @exit_code, @duration_ms)`
  );

  let ingested = 0;
  let skipped = 0;
  const run = db.transaction((rows) => {
    for (const row of rows) {
      const res = insert.run(row);
      ingested += res.changes;
    }
  });

  const rows = [];
  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      rows.push({
        line_hash: lineHash(line),
        ts: r.ts ?? null,
        cmd: r.cmd ?? r.command ?? null,
        args: JSON.stringify(r.args ?? []),
        exit_code: r.exitCode ?? null,
        duration_ms: r.durationMs ?? null,
      });
    } catch {
      skipped += 1; // linha corrompida — pula, não derruba o sync
    }
  }

  run(rows);
  const total = db.prepare('SELECT count(*) AS n FROM audit_runs').get().n;
  db.close();
  return { ingested, total, skipped };
}

/** Converte `7d` / `24h` / `30m` num timestamp ISO de corte, ou null. */
function sinceCutoff(since) {
  if (!since) return null;
  const m = /^(\d+)([dhm])$/.exec(since);
  if (!m) return null;
  const [, n, unit] = m;
  const ms = { d: 864e5, h: 36e5, m: 6e4 }[unit] * Number(n);
  return new Date(Date.now() - ms).toISOString();
}

/**
 * Consulta estruturada. `{ since, cmd, gate, failed }`.
 * @returns {Promise<Run[]>}
 */
export async function queryAudit(env = defaultEnv(), opts = {}) {
  const db = await openDb(env);
  const where = [];
  const params = {};

  const cutoff = sinceCutoff(opts.since);
  if (cutoff) { where.push('ts >= @cutoff'); params.cutoff = cutoff; }
  if (opts.cmd) { where.push('cmd = @cmd'); params.cmd = opts.cmd; }
  if (opts.failed) where.push('exit_code != 0');

  const sql = `SELECT ts, cmd, args, exit_code AS exitCode, duration_ms AS durationMs
               FROM audit_runs ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY ts DESC`;
  const rows = db.prepare(sql).all(params);
  db.close();
  return rows.map((r) => ({ ...r, args: JSON.parse(r.args || '[]') }));
}

/**
 * Resumo para o painel: total, falhas, por comando, mais lentos, recentes.
 * @returns {Promise<{ total, fails, byCmd, slowest, recent }>}
 */
export async function auditSummary(env = defaultEnv()) {
  const db = await openDb(env);
  const total = db.prepare('SELECT count(*) AS n FROM audit_runs').get().n;
  const fails = db.prepare('SELECT count(*) AS n FROM audit_runs WHERE exit_code != 0').get().n;
  const byCmd = db.prepare(
    `SELECT cmd, count(*) AS runs, sum(exit_code != 0) AS fails, round(avg(duration_ms)) AS avgMs
     FROM audit_runs GROUP BY cmd ORDER BY runs DESC`
  ).all();
  const slowest = db.prepare(
    'SELECT cmd, max(duration_ms) AS ms FROM audit_runs GROUP BY cmd ORDER BY ms DESC LIMIT 5'
  ).all();
  const recent = db.prepare(
    'SELECT ts, cmd, exit_code AS exitCode, duration_ms AS durationMs FROM audit_runs ORDER BY ts DESC LIMIT 12'
  ).all();
  db.close();
  return { total, fails, byCmd, slowest, recent };
}

/** Último exit code de um comando (para o painel mostrar o estado sem reexecutar — D4). */
export async function lastExit(env, cmd) {
  const db = await openDb(env);
  const row = db.prepare('SELECT exit_code AS exitCode, ts FROM audit_runs WHERE cmd = ? ORDER BY ts DESC LIMIT 1').get(cmd);
  db.close();
  return row ?? null;
}
