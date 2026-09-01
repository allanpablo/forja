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

test('agent:recommend — ranking real: role+domain casados > só role > só domain, ordem correta', async () => {
  const workspace = newWorkspace();
  try {
    run(['register', 'agent-a', '--role', 'developer', '--domains', 'backend'], workspace);
    run(['register', 'agent-b', '--role', 'developer'], workspace);
    run(['register', 'agent-c', '--role', 'reviewer', '--domains', 'backend'], workspace);
    await seedObservations(workspace, 'agent-a'); // 4 sucessos, 1 rollback — dá trustLevel real a agent-a
    run(['score', 'agent-a'], workspace);

    const result = run(['recommend', '--role', 'developer', '--domain', 'backend'], workspace);
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.trim().split('\n').filter((line) => line.startsWith('agent-'));
    assert.deepEqual(lines.map((line) => line.split(/\s+/)[0]), ['agent-a', 'agent-b', 'agent-c'], 'agent-a (role+domain+trust) > agent-b (só role) > agent-c (só domain)');
    assert.match(result.stdout, /informação, não atribuição/);
  } finally {
    cleanup(workspace);
  }
});

test('agent:recommend — exige --role', () => {
  const workspace = newWorkspace();
  try {
    const result = run(['recommend'], workspace);
    assert.notEqual(result.status, 0);
  } finally {
    cleanup(workspace);
  }
});

/**
 * Semeia Observations com createdAt EXPLÍCITO — sintético documentado como tal (§8 de SPEC-040) —
 * pra controlar em qual lado do corte da janela cada uma cai: `beforeCutoff` (linha de base, boa)
 * vs. `afterCutoff` (recente, degradada — successRate caindo de ~90% pra ~30%).
 */
async function seedMonitoringObservations(workspace, agentId) {
  const dbPath = path.join(workspace, 'universal.db');
  fs.mkdirSync(workspace, { recursive: true });
  const { default: Database } = await import('better-sqlite3');
  const { SqliteMigrationRunner, SqliteObservationStore } = await import('../packages/adapter-sqlite/src/index.ts');
  const database = new Database(dbPath);
  new SqliteMigrationRunner(database).apply();
  const store = new SqliteObservationStore(database);
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const base = { schemaVersion: '2.0', updatedAt: now, correlationId: 'test', agentId, contextRefs: [], inputTokens: 10, outputTokens: 10, durationMs: 100, tools: [], files: [], commands: [] };
  // linha de base (fora da janela de 24h): 9 sucessos, 1 falha — ~90% de sucesso.
  for (let i = 0; i < 9; i += 1) store.append({ ...base, id: `baseline-ok-${i}`, traceId: `bt-${i}`, createdAt: twoDaysAgo, outcome: 'succeeded' });
  store.append({ ...base, id: 'baseline-fail-0', traceId: 'bt-fail', createdAt: twoDaysAgo, outcome: 'failed' });
  // recente (dentro da janela de 24h): 3 sucessos, 7 falhas — ~30% de sucesso.
  for (let i = 0; i < 3; i += 1) store.append({ ...base, id: `recent-ok-${i}`, traceId: `rt-${i}`, createdAt: now, outcome: 'succeeded' });
  for (let i = 0; i < 7; i += 1) store.append({ ...base, id: `recent-fail-${i}`, traceId: `rtf-${i}`, createdAt: now, outcome: 'failed' });
  database.close();
}

test('agent:monitor — degradação clara sintética (successRate 90% → 30%) sinaliza corretamente, nunca bloqueia', async () => {
  const workspace = newWorkspace();
  try {
    run(['register', 'agent-1', '--role', 'developer'], workspace);
    await seedMonitoringObservations(workspace, 'agent-1');

    const result = run(['monitor', 'agent-1', '--window-hours', '24'], workspace);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /score de anomalia \d+\/100/);
    assert.match(result.stdout, /linha de base: 10 observation\(s\)/);
    assert.match(result.stdout, /recente: 10 observation\(s\)/);
    assert.match(result.stdout, /successRate: 0\.90 → 0\.30/);
    assert.match(result.stdout, /informação, não decisão automática/);
  } finally {
    cleanup(workspace);
  }
});

test('agent:monitor — agente sem nenhuma Observation não sinaliza anomalia (não há degradação sem dado)', () => {
  const workspace = newWorkspace();
  try {
    run(['register', 'agent-1', '--role', 'developer'], workspace);
    const result = run(['monitor', 'agent-1'], workspace);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /score de anomalia 0\/100/);
  } finally {
    cleanup(workspace);
  }
});

test('agent:monitor — exige um id', () => {
  const workspace = newWorkspace();
  try {
    const result = run(['monitor'], workspace);
    assert.notEqual(result.status, 0);
  } finally {
    cleanup(workspace);
  }
});
