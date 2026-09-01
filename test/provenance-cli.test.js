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
  return spawnSync(process.execPath, ['scripts/provenance.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORJA_WORKSPACE: workspace, FORJA_RUNTIME_DB: path.join(workspace, 'universal.db') },
  });
}

function newWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'forja-provenance-workspace-'));
}

function cleanup(workspace) {
  fs.rmSync(workspace, { recursive: true, force: true });
}

/** Semeia um RuntimeRun SINTÉTICO diretamente no SQLite — documentado como tal (§8 do spec). */
async function seedRun(workspace, overrides = {}) {
  const dbPath = path.join(workspace, 'universal.db');
  fs.mkdirSync(workspace, { recursive: true });
  const { default: Database } = await import('better-sqlite3');
  const { SqliteMigrationRunner, SqliteRuntimeRunStore } = await import('../packages/adapter-sqlite/src/index.ts');
  const database = new Database(dbPath);
  new SqliteMigrationRunner(database).apply();
  const now = new Date().toISOString();
  new SqliteRuntimeRunStore(database).save({
    schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'run-1',
    runId: 'run-1', objective: 'fix bug', agent: { id: 'agent-1', name: 'worker', role: 'developer', autonomy: 'supervised' },
    policy: { effect: 'ALLOW', reason: 'ok', policyId: 'p1' }, budget: { totalTokens: 100, usedTokens: 10 },
    state: 'completed', steps: 1, evidence: [], changedFiles: ['a.ts', 'b.ts'], metrics: { tokensUsed: 10, durationMs: 100 },
    ...overrides,
  });
  database.close();
}

test('provenance:record — recusa run-id inexistente', () => {
  const workspace = newWorkspace();
  try {
    const result = run(['record', 'nao-existe'], workspace);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /não encontrado/);
  } finally {
    cleanup(workspace);
  }
});

test('provenance:record + blame + sbom — ciclo completo sobre run sintético documentado', async () => {
  const workspace = newWorkspace();
  try {
    await seedRun(workspace);

    const record = run(['record', 'run-1'], workspace);
    assert.equal(record.status, 0, record.stderr);
    assert.match(record.stdout, /2 registro\(s\)/);

    const blame = run(['blame', 'a.ts'], workspace);
    assert.equal(blame.status, 0, blame.stderr);
    assert.match(blame.stdout, /worker \(agent-1\)/);
    assert.match(blame.stdout, /run:run-1/);

    const sbomJson = run(['sbom', '--json'], workspace);
    assert.equal(sbomJson.status, 0, sbomJson.stderr);
    const report = JSON.parse(sbomJson.stdout);
    assert.equal(report.totalRecords, 2);
    assert.equal(report.byAgent.length, 1);
    assert.equal(report.byAgent[0].agentId, 'agent-1');
    assert.deepEqual(report.byAgent[0].files, ['a.ts', 'b.ts']);

    const sbomText = run(['sbom'], workspace);
    assert.match(sbomText.stdout, /AI-SBOM/);
    assert.match(sbomText.stdout, /worker \(agent-1\) — 2 arquivo\(s\)/);
  } finally {
    cleanup(workspace);
  }
});

test('blame — arquivo nunca tocado devolve vazio, não erro', () => {
  const workspace = newWorkspace();
  try {
    const result = run(['blame', 'never-touched.ts'], workspace);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Nenhum registro/);
  } finally {
    cleanup(workspace);
  }
});

test('sbom — sem nenhum registro ainda, mensagem clara em vez de relatório vazio confuso', () => {
  const workspace = newWorkspace();
  try {
    const result = run(['sbom'], workspace);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Nenhum registro de proveniência ainda/);
  } finally {
    cleanup(workspace);
  }
});

test('provenance:record — regravar o mesmo run é idempotente, não duplica registros', async () => {
  const workspace = newWorkspace();
  try {
    await seedRun(workspace);
    run(['record', 'run-1'], workspace);
    run(['record', 'run-1'], workspace);
    const sbomJson = run(['sbom', '--json'], workspace);
    const report = JSON.parse(sbomJson.stdout);
    assert.equal(report.totalRecords, 2, 'regravar o mesmo run não deveria duplicar (D2/chave runId:file)');
  } finally {
    cleanup(workspace);
  }
});
