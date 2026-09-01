import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function run(args, workspace) {
  return spawnSync(process.execPath, ['scripts/incident.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORJA_WORKSPACE: workspace, FORJA_RUNTIME_DB: path.join(workspace, 'universal.db') },
  });
}

function newWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'forja-incident-workspace-'));
}

function cleanup(workspace) {
  fs.rmSync(workspace, { recursive: true, force: true });
}

test('incident:record — exige --title', () => {
  const workspace = newWorkspace();
  try {
    const result = run(['record'], workspace);
    assert.notEqual(result.status, 0);
  } finally {
    cleanup(workspace);
  }
});

test('incident:list — sem nenhum incidente ainda, mensagem clara', () => {
  const workspace = newWorkspace();
  try {
    const result = run(['list'], workspace);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Nenhum incidente registrado ainda/);
  } finally {
    cleanup(workspace);
  }
});

test('incident:similar — sem nenhum incidente registrado devolve vazio, não erro (AC-5)', () => {
  const workspace = newWorkspace();
  try {
    const result = run(['similar', 'qualquer coisa'], workspace);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Nenhum incidente parecido/);
  } finally {
    cleanup(workspace);
  }
});

test('incident:record + list + similar — ciclo completo, ordena corretamente entre 2 parecidos e 1 diferente', () => {
  const workspace = newWorkspace();
  try {
    const a = run(['record', '--title', 'SQLite writes not batched', '--description', 'GraphIndexer sync is slow because SqliteGraphStore saves one row at a time without a transaction'], workspace);
    assert.equal(a.status, 0, a.stderr);
    assert.match(a.stdout, /Incidente registrado:/);
    run(['record', '--title', 'npm test hangs in a sandboxed worktree', '--description', 'sandboxEnvironment strips HOME, npm cannot resolve its config dir and hangs'], workspace);
    run(['record', '--title', 'Frontend build fails on CI', '--description', 'Webpack config references a missing asset path'], workspace);

    const list = run(['list'], workspace);
    assert.equal(list.status, 0, list.stderr);
    const lines = list.stdout.trim().split('\n');
    assert.equal(lines.length, 3);
    assert.match(lines[0], /Frontend build fails on CI/, 'mais recente primeiro (AC-2)');

    const similarSqlite = run(['similar', 'sqlite writes are slow because not batched'], workspace);
    assert.equal(similarSqlite.status, 0, similarSqlite.stderr);
    assert.match(similarSqlite.stdout, /SQLite writes not batched/);
    assert.doesNotMatch(similarSqlite.stdout, /Frontend build/, 'incidente sem sobreposição de termos não deveria aparecer no ranking');
    assert.match(similarSqlite.stdout, /nunca aplicação automática/);

    const similarNpm = run(['similar', 'npm hangs sandboxed'], workspace);
    assert.match(similarNpm.stdout, /npm test hangs in a sandboxed worktree/);
    assert.doesNotMatch(similarNpm.stdout, /SQLite writes/);
  } finally {
    cleanup(workspace);
  }
});
