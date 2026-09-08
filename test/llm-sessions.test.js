import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import Database from 'better-sqlite3';
import { SqliteMigrationRunner, SqliteJsonRepository } from '../packages/adapter-sqlite/src/index.ts';
import { LlmSessionStore } from '../lib/llm/session.ts';
import { buildEngineerBlock } from '../lib/llm/context.ts';

const root = path.resolve(import.meta.dirname, '..');
const forja = path.join(root, 'bin', 'forja.ts');

// --- buildEngineerBlock (SPEC-048 AC-3/AC-8) --------------------------------

test('buildEngineerBlock: run code 0 → bloco rotulado + ref, sem persistir conteúdo', () => {
  const report = { objective: 'x', context: { references: 2, content: ['a', 'b'] } };
  const block = buildEngineerBlock('adicionar cache', {
    run: (argv) => {
      assert.deepEqual(argv, ['engineer', 'adicionar cache', '--json']);
      return { code: 0, stdout: JSON.stringify(report), stderr: '' };
    },
  });
  assert.equal(block.ref, 'engineer:adicionar cache');
  assert.match(block.text, /Contexto do engineer \(objetivo: adicionar cache\)/);
  assert.ok(block.text.includes(JSON.stringify(report)));
});

test('buildEngineerBlock: run code ≠ 0 → Error com .code ENGINEER_FAILED', () => {
  try {
    buildEngineerBlock('x', { run: () => ({ code: 1, stdout: '', stderr: 'grafo indisponível\noutra linha' }) });
    assert.fail('deveria ter lançado');
  } catch (error) {
    assert.equal(error.code, 'ENGINEER_FAILED');
    assert.equal(error.detail, 'grafo indisponível');
  }
});

// --- LlmSessionStore.all / find (AC-4/AC-5/AC-8) --------------------------

function seededRepo() {
  const db = new Database(':memory:');
  new SqliteMigrationRunner(db).apply();
  const repo = new SqliteJsonRepository(db);
  repo.put('llm_session', 's-old', { id: 's-old', cwd: '/w/proj', profileHash: 'h', observationId: 'o1', updatedAt: '2026-09-01T00:00:00.000Z' }, '2026-09-01T00:00:00.000Z');
  repo.put('llm_session', 's-new', { id: 's-new', cwd: '/w/proj', profileHash: 'h', observationId: 'o2', updatedAt: '2026-09-08T00:00:00.000Z' }, '2026-09-08T00:00:00.000Z');
  return { db, store: new LlmSessionStore(repo) };
}

test('LlmSessionStore.all: mais recente primeiro', () => {
  const { db, store } = seededRepo();
  try {
    assert.deepEqual(store.all().map((s) => s.id), ['s-new', 's-old']);
  } finally { db.close(); }
});

test('LlmSessionStore.find: acha por id; undefined para ausente', () => {
  const { db, store } = seededRepo();
  try {
    assert.equal(store.find('s-old')?.observationId, 'o1');
    assert.equal(store.find('nao-existe'), undefined);
  } finally { db.close(); }
});

// --- CLI: llm:sessions list|show (AC-4/AC-5/AC-6) ------------------------

test('forja llm:sessions list|show num workspace com sessão semeada', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-llm-sessions-'));
  const runForja = (args) => spawnSync(process.execPath, [forja, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, FORJA_WORKSPACE: ws } });
  try {
    assert.equal(runForja(['workspace:init']).status, 0);
    const dbPath = path.join(ws, 'memory', 'sqlite', 'universal.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    new SqliteMigrationRunner(db).apply();
    const repo = new SqliteJsonRepository(db);
    repo.put('llm_session', 'sess-1', { id: 'sess-1', cwd: '/w/demo', profileHash: 'h', observationId: 'obs-1', updatedAt: '2026-09-08T00:00:00.000Z' }, '2026-09-08T00:00:00.000Z');
    db.close();

    const list = runForja(['llm:sessions', 'list', '--json']);
    assert.equal(list.status, 0, list.stderr);
    assert.deepEqual(JSON.parse(list.stdout).map((s) => s.id), ['sess-1']);

    const show = runForja(['llm:sessions', 'show', 'sess-1', '--json']);
    assert.equal(show.status, 0, show.stderr);
    assert.equal(JSON.parse(show.stdout).session.id, 'sess-1');

    const bad = runForja(['llm:sessions', 'show', 'nope']);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /não encontrada/);

    // read-only: a linha do llm_session não muda
    const check = new Database(dbPath);
    const row = new SqliteJsonRepository(check).get('llm_session', 'sess-1');
    check.close();
    assert.equal(row.observationId, 'obs-1');
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});
