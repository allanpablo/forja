#!/usr/bin/env node
/**
 * agent-router — registra e consulta handoffs entre sub-agents.
 *
 * Schema (criado on-demand em universal.db):
 *
 *   CREATE TABLE handoffs (
 *     id INTEGER PRIMARY KEY AUTOINCREMENT,
 *     created_at TEXT NOT NULL,
 *     from_agent TEXT NOT NULL,
 *     to_agent TEXT NOT NULL,
 *     intent TEXT NOT NULL,           -- implement|review|plan|research
 *     context TEXT NOT NULL,          -- paths, refs, links
 *     acceptance TEXT NOT NULL,       -- AC mensurável
 *     constraints TEXT NOT NULL,      -- limites
 *     return_to TEXT NOT NULL,        -- para onde devolver
 *     spec_slug TEXT,                 -- specs/<slug> opcional
 *     status TEXT DEFAULT 'open',     -- open|in_progress|done|cancelled|archived
 *     payload_json TEXT
 *   );
 *
 * Uso:
 *   agent-router append < handoff.json    # lê JSON do stdin
 *   agent-router append '{"from":"product",...}'
 *   agent-router list [--open] [--to <agent>]
 *   agent-router show <id>
 *   agent-router done <id>
 *   agent-router schema                   # imprime schema/migra
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { getDbPath, ensureSchema } from './memory-schema.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
ensureSchema({ silent: true });
const dbPath = getDbPath();

const REQUIRED = ['from', 'to', 'intent', 'context', 'acceptance', 'constraints', 'return'];
const VALID_AGENTS = ['orchestrator', 'context-engineer', 'sdd-architect', 'product', 'marketing', 'governance', 'worker', 'user'];
const VALID_INTENTS = ['implement', 'review', 'plan', 'research', 'spec', 'route'];
const BUSY_ATTEMPTS = 8;
const BUSY_DELAY_MS = 150;

function fail(msg, code = 1) {
  fs.writeSync(2, `[agent-router] ${msg}\n`);
  process.exit(code);
}

function openDb() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { timeout: 5000 });
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');
  withBusyRetry(() => db.exec(`
    CREATE TABLE IF NOT EXISTS handoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      intent TEXT NOT NULL,
      context TEXT NOT NULL,
      acceptance TEXT NOT NULL,
      constraints TEXT NOT NULL,
      return_to TEXT NOT NULL,
      spec_slug TEXT,
      status TEXT DEFAULT 'open',
      payload_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs(status);
    CREATE INDEX IF NOT EXISTS idx_handoffs_to ON handoffs(to_agent, status);
  `));
  return db;
}

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function withBusyRetry(fn) {
  let lastError;
  for (let attempt = 1; attempt <= BUSY_ATTEMPTS; attempt++) {
    try { return fn(); }
    catch (err) {
      if (err?.code !== 'SQLITE_BUSY' && err?.code !== 'SQLITE_LOCKED') throw err;
      lastError = err;
      sleepSync(BUSY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

function readStdin() {
  return fs.readFileSync(0, 'utf8');
}

function parsePayload(raw) {
  let obj;
  try { obj = JSON.parse(raw); } catch (e) { fail(`JSON inválido: ${e.message}`); }
  for (const k of REQUIRED) {
    if (!obj[k] || typeof obj[k] !== 'string') fail(`campo obrigatório ausente ou inválido: ${k} (ADR-0005)`);
  }
  if (!VALID_AGENTS.includes(obj.from)) fail(`from inválido: ${obj.from}. Use um de: ${VALID_AGENTS.join(', ')}`);
  if (!VALID_AGENTS.includes(obj.to)) fail(`to inválido: ${obj.to}`);
  if (!VALID_INTENTS.includes(obj.intent)) fail(`intent inválido: ${obj.intent}. Use: ${VALID_INTENTS.join(', ')}`);
  return obj;
}

function cmdAppend(arg) {
  const raw = arg && arg !== '-' ? arg : readStdin();
  const h = parsePayload(raw);
  const db = openDb();
  const stmt = db.prepare(`
    INSERT INTO handoffs (created_at, from_agent, to_agent, intent, context, acceptance, constraints, return_to, spec_slug, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = withBusyRetry(() => stmt.run(
    new Date().toISOString(),
    h.from, h.to, h.intent,
    h.context, h.acceptance, h.constraints, h.return,
    h.spec_slug || null,
    JSON.stringify(h)
  ));
  console.log(JSON.stringify({ id: result.lastInsertRowid, status: 'open', from: h.from, to: h.to, intent: h.intent }));
  db.close();
}

function cmdList(args) {
  const db = openDb();
  const filters: string[] = [];
  const params: any[] = [];
  if (args.includes('--open')) filters.push("status = 'open'");
  const toIdx = args.indexOf('--to');
  if (toIdx >= 0 && args[toIdx + 1]) { filters.push('to_agent = ?'); params.push(args[toIdx + 1]); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT id, created_at, from_agent, to_agent, intent, status, spec_slug FROM handoffs ${where} ORDER BY id DESC LIMIT 50`).all(...params);
  if (!rows.length) { console.log('(sem handoffs)'); db.close(); return; }
  for (const r of rows) {
    console.log(`#${r.id} [${r.status}] ${r.from_agent} → ${r.to_agent} (${r.intent}) ${r.spec_slug || ''} — ${r.created_at}`);
  }
  db.close();
}

function cmdShow(idArg) {
  const id = parseInt(idArg, 10);
  if (!id) fail('uso: agent-router show <id>');
  const db = openDb();
  const row = db.prepare('SELECT * FROM handoffs WHERE id = ?').get(id);
  if (!row) fail(`handoff ${id} não encontrado`);
  console.log(JSON.stringify(row, null, 2));
  db.close();
}

function cmdSetStatus(idArg, status) {
  const id = parseInt(idArg, 10);
  if (!id) fail(`uso: agent-router ${status} <id>`);
  const db = openDb();
  const r = withBusyRetry(() => db.prepare('UPDATE handoffs SET status = ? WHERE id = ?').run(status, id));
  if (!r.changes) fail(`handoff ${id} não encontrado`);
  fs.writeSync(1, `handoff #${id} → ${status}\n`);
  db.close();
}

function cmdSchema() {
  openDb().close();
  console.log(`✓ schema OK em ${dbPath}`);
}

const [, , subcmd, ...rest] = process.argv;
switch (subcmd) {
  case 'append': cmdAppend(rest[0]); break;
  case 'list': cmdList(rest); break;
  case 'show': cmdShow(rest[0]); break;
  case 'done': cmdSetStatus(rest[0], 'done'); break;
  case 'in_progress': cmdSetStatus(rest[0], 'in_progress'); break;
  case 'cancel': cmdSetStatus(rest[0], 'cancelled'); break;
  case 'archive': cmdSetStatus(rest[0], 'archived'); break;
  case 'schema': cmdSchema(); break;
  default:
    console.log('Uso: agent-router <append|list|show|done|in_progress|cancel|archive|schema> [args]');
    process.exit(1);
}
