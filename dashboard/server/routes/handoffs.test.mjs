/**
 * Testes da rota handoffs.
 * Usa o universal.db real (com schema já criado por scripts/agent-router.mjs).
 * Cria/limpa registros de teste com prefixo identificável.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { buildServer } from '../index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
import { getWorkspaceDbPath, initWorkspace } from '../../../lib/workspace.mjs';

function setupTestWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-handoffs-'));
  process.env.FORJA_WORKSPACE = root;
  initWorkspace();
  return { root, dbPath: getWorkspaceDbPath() };
}

// Inicializa schema chamando o script do framework no workspace temporário
function ensureDbSchema(dbPath) {
  const db = new Database(dbPath);
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
  `);
  db.close();
}

const { root: testRoot, dbPath } = setupTestWorkspace();
ensureDbSchema(dbPath);

const TEST_SLUG = '__dashboard-test__';
let createdIds = [];

function insertTestHandoff(extra = {}) {
  const db = new Database(dbPath);
  const stmt = db.prepare(`
    INSERT INTO handoffs (created_at, from_agent, to_agent, intent, context, acceptance, constraints, return_to, spec_slug, status)
    VALUES (?, 'product', 'worker', 'implement', 'test ctx', 'test ac', 'test cnst', 'test ret', ?, ?)
  `);
  const r = stmt.run(new Date().toISOString(), TEST_SLUG, extra.status || 'open');
  db.close();
  createdIds.push(Number(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}

before(() => {
  if (!fs.existsSync(dbPath)) throw new Error(`universal.db ausente em ${dbPath} — rode scripts/agent-router.mjs schema`);
});

after(() => {
  if (!createdIds.length) return;
  const db = new Database(dbPath);
  db.prepare(`DELETE FROM handoffs WHERE spec_slug = ?`).run(TEST_SLUG);
  db.close();
  createdIds = [];
});

test('GET /api/handoffs filtra por spec', async () => {
  insertTestHandoff();
  insertTestHandoff();
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'GET', url: `/api/handoffs?spec=${TEST_SLUG}` });
  await app.close();
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.length, 2);
  assert.ok(body.every(h => h.spec_slug === TEST_SLUG));
});

test('GET /api/handoffs filtra por status', async () => {
  const id = insertTestHandoff({ status: 'done' });
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'GET', url: `/api/handoffs?spec=${TEST_SLUG}&status=done` });
  await app.close();
  const body = res.json();
  assert.ok(body.some(h => h.id === id));
  assert.ok(body.every(h => h.status === 'done'));
});

test('GET /api/handoffs filtra arquivados', async () => {
  const id = insertTestHandoff({ status: 'archived' });
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'GET', url: `/api/handoffs?spec=${TEST_SLUG}&status=archived` });
  await app.close();
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.some(h => h.id === id));
  assert.ok(body.every(h => h.status === 'archived'));
});

test('GET /api/handoffs?status=bogus → 400', async () => {
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'GET', url: '/api/handoffs?status=bogus' });
  await app.close();
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'INVALID_STATUS');
});

test('GET /api/handoffs/:id devolve registro completo', async () => {
  const id = insertTestHandoff();
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'GET', url: `/api/handoffs/${id}` });
  await app.close();
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.id, id);
  assert.equal(body.from_agent, 'product');
  assert.equal(body.return_to, 'test ret');
});

test('GET /api/handoffs/:id 404 para id inexistente', async () => {
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'GET', url: '/api/handoffs/99999999' });
  await app.close();
  assert.equal(res.statusCode, 404);
});

test('GET /api/handoffs/:id 400 para id inválido', async () => {
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'GET', url: '/api/handoffs/abc' });
  await app.close();
  assert.equal(res.statusCode, 400);
});

test('POST transition: target inválido → 400', async () => {
  const id = insertTestHandoff();
  const app = buildServer({ logger: false });
  const res = await app.inject({
    method: 'POST',
    url: `/api/handoffs/${id}/transition`,
    payload: { to: 'aberto' },
  });
  await app.close();
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'INVALID_TARGET');
});

test('POST transition: body sem to → 400', async () => {
  const id = insertTestHandoff();
  const app = buildServer({ logger: false });
  const res = await app.inject({
    method: 'POST',
    url: `/api/handoffs/${id}/transition`,
    payload: {},
  });
  await app.close();
  assert.equal(res.statusCode, 400);
});

test('POST transition: válido atualiza status no DB', async () => {
  const id = insertTestHandoff();
  const app = buildServer({ logger: false });
  const res = await app.inject({
    method: 'POST',
    url: `/api/handoffs/${id}/transition`,
    payload: { to: 'in_progress' },
  });
  await app.close();
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.id, id);
  assert.equal(body.status, 'in_progress');
  assert.match(body.source, /^[a-f0-9]+$/, 'source deve ser hex');

  // confirma no DB
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare('SELECT status FROM handoffs WHERE id = ?').get(id);
  db.close();
  assert.equal(row.status, 'in_progress');
});

test('POST transition: done pode arquivar', async () => {
  const id = insertTestHandoff({ status: 'done' });
  const app = buildServer({ logger: false });
  const res = await app.inject({
    method: 'POST',
    url: `/api/handoffs/${id}/transition`,
    payload: { to: 'archived' },
  });
  await app.close();
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().status, 'archived');

  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare('SELECT status FROM handoffs WHERE id = ?').get(id);
  db.close();
  assert.equal(row.status, 'archived');
});

test('POST transition: id inexistente → 404', async () => {
  const app = buildServer({ logger: false });
  const res = await app.inject({
    method: 'POST',
    url: '/api/handoffs/99999999/transition',
    payload: { to: 'done' },
  });
  await app.close();
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'HANDOFF_NOT_FOUND');
});
