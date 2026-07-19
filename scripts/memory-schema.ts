#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { getWorkspaceDbPath, initWorkspace } from '../lib/workspace.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function getDbPath() {
  return getWorkspaceDbPath();
}

function ensureSchema({ silent = false } = {}) {
  initWorkspace();
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { timeout: 5000 });
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS spec_summaries (
      slug TEXT PRIMARY KEY,
      status TEXT,
      title TEXT,
      summary TEXT NOT NULL,
      source_path TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS context_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      slug TEXT,
      path TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      estimated_tokens INTEGER NOT NULL,
      limit_tokens INTEGER,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      summary TEXT,
      tags TEXT,
      updated_at TEXT NOT NULL
    );

    -- Projecao consultavel do audit trail (.context/forja-runs.jsonl), SPEC-014. O jsonl e a
    -- fonte de verdade append-only; esta tabela e reconstruivel por audit:sync. line_hash (hash
    -- do conteudo da linha) da idempotencia: re-sync nao duplica.
    CREATE TABLE IF NOT EXISTS audit_runs (
      line_hash TEXT PRIMARY KEY,
      ts TEXT,
      cmd TEXT,
      args TEXT,
      exit_code INTEGER,
      duration_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_context_runs_kind_slug ON context_runs(kind, slug);
    CREATE INDEX IF NOT EXISTS idx_asset_catalog_type_name ON asset_catalog(type, name);
    CREATE INDEX IF NOT EXISTS idx_audit_runs_cmd ON audit_runs(cmd);
    CREATE INDEX IF NOT EXISTS idx_audit_runs_ts ON audit_runs(ts);
  `);

  db.close();
  if (!silent) console.log(`Schema auxiliar OK: ${getDbPath()}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureSchema();
}

export { ensureSchema, getDbPath };
