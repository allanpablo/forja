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
  return spawnSync(process.execPath, ['scripts/agent.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORJA_WORKSPACE: workspace, FORJA_RUNTIME_DB: path.join(workspace, 'universal.db') },
  });
}

function newWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'forja-agent-workspace-'));
}

function cleanup(workspace) {
  fs.rmSync(workspace, { recursive: true, force: true });
}

/**
 * Semeia `Observation`s SINTÉTICAS diretamente no SQLite — documentado como tal (§8 do spec: "ou
 * contra uma amostra sintética documentada como tal", já que este workspace de teste não tem
 * Observation real acumulada). 4 sucessos, 1 falha com rollback — dá um sinal misto real pra
 * exercitar a fórmula, não só os extremos 0/5 já cobertos pelos testes unitários do engine puro.
 */
async function seedObservations(workspace, agentId) {
  const dbPath = path.join(workspace, 'universal.db');
  fs.mkdirSync(workspace, { recursive: true });
  const { default: Database } = await import('better-sqlite3');
  const { SqliteMigrationRunner, SqliteObservationStore } = await import('../packages/adapter-sqlite/src/index.ts');
  const database = new Database(dbPath);
  new SqliteMigrationRunner(database).apply();
  const store = new SqliteObservationStore(database);
  const now = new Date().toISOString();
  const base = { schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'test', agentId, contextRefs: [], inputTokens: 10, outputTokens: 10, durationMs: 100, tools: [], files: [], commands: [] };
  for (let i = 0; i < 4; i += 1) store.append({ ...base, id: `obs-ok-${i}`, traceId: `t-${i}`, outcome: 'succeeded' });
  store.append({ ...base, id: 'obs-fail-0', traceId: 't-fail', outcome: 'failed', errorCode: 'ROLLBACK' });
  database.close();
}

test('agent:register + :list + :show — ciclo básico, sem trustLevel até rodar :score', () => {
  const workspace = newWorkspace();
  try {
    const register = run(['register', 'agent-1', '--role', 'developer', '--capabilities', 'write,test'], workspace);
    assert.equal(register.status, 0, register.stderr);
    assert.match(register.stdout, /Registrado: agent-1/);

    const list = run(['list'], workspace);
    assert.match(list.stdout, /agent-1.*sem pontuação/);

    const show = run(['show', 'agent-1'], workspace);
    const profile = JSON.parse(show.stdout);
    assert.equal(profile.role, 'developer');
    assert.deepEqual(profile.capabilities, ['write', 'test']);
    assert.equal('trustLevel' in profile && profile.trustLevel !== undefined, false);
  } finally {
    cleanup(workspace);
  }
});

test('agent:score — cold start (zero Observation) produz trustLevel 0 e human_in_the_loop, não erro', () => {
  const workspace = newWorkspace();
  try {
    run(['register', 'agent-1', '--role', 'developer'], workspace);
    const score = run(['score', 'agent-1'], workspace);
    assert.equal(score.status, 0, score.stderr);
    assert.match(score.stdout, /trustLevel 0\/5 → human_in_the_loop/);
  } finally {
    cleanup(workspace);
  }
});

test('agent:score — amostra sintética documentada (4 sucessos, 1 rollback) produz score e persiste no profile', async () => {
  const workspace = newWorkspace();
  try {
    run(['register', 'agent-1', '--role', 'developer'], workspace);
    await seedObservations(workspace, 'agent-1');

    const score = run(['score', 'agent-1'], workspace);
    assert.equal(score.status, 0, score.stderr);
    assert.match(score.stdout, /amostra: 5 observation\(s\)/);
    assert.match(score.stdout, /trustLevel \d\/5/);

    const show = run(['show', 'agent-1'], workspace);
    const profile = JSON.parse(show.stdout);
    assert.ok(typeof profile.trustLevel === 'number', 'score deve persistir trustLevel no profile');
    assert.ok(profile.lastScoredAt, 'score deve persistir lastScoredAt');
  } finally {
    cleanup(workspace);
  }
});

test('agent:history — lista Observations reais, mais recentes primeiro', async () => {
  const workspace = newWorkspace();
  try {
    run(['register', 'agent-1', '--role', 'developer'], workspace);
    await seedObservations(workspace, 'agent-1');

    const history = run(['history', 'agent-1'], workspace);
    assert.equal(history.status, 0, history.stderr);
    const lines = history.stdout.trim().split('\n');
    assert.equal(lines.length, 5);
    assert.match(lines[0], /failed|succeeded/);
  } finally {
    cleanup(workspace);
  }
});

test('agent:show — recusa agente não registrado', () => {
  const workspace = newWorkspace();
  try {
    const result = run(['show', 'nao-existe'], workspace);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /não encontrado/);
  } finally {
    cleanup(workspace);
  }
});
