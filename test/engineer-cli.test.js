import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result;
}

/** Fixture pequena: uma ADR com Constraints (pra architecture:check ter algo real pra reportar) e docs/fluxo.md real (copiado do próprio repositório — D2 do plan, uma fonte de verdade). */
function createFixture() {
  const graphRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-engineer-fixture-'));
  fs.mkdirSync(path.join(graphRoot, 'memory', '90-decisions'), { recursive: true });
  fs.mkdirSync(path.join(graphRoot, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(graphRoot, 'packages', 'auth', 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(graphRoot, 'memory', '90-decisions', '0001-isolamento.md'),
    '# ADR-0001: Isolamento\n\n- **Status**: accepted\n\n## Constraints\n\n- packages/policy não depende de better-sqlite3\n',
  );
  fs.copyFileSync(path.join(root, 'docs', 'fluxo.md'), path.join(graphRoot, 'docs', 'fluxo.md'));
  fs.writeFileSync(path.join(graphRoot, 'packages', 'auth', 'src', 'index.ts'), 'export function login() { return true; }\n');
  git(['init', '-q'], graphRoot);
  git(['config', 'user.email', 'forja-test@example.invalid'], graphRoot);
  git(['config', 'user.name', 'Forja Test'], graphRoot);
  git(['add', '.'], graphRoot);
  git(['commit', '-qm', 'fixture'], graphRoot);
  return graphRoot;
}

function run(script, args, graphRoot, workspace) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORJA_GRAPH_ROOT: graphRoot, FORJA_WORKSPACE: workspace, FORJA_RUNTIME_DB: path.join(workspace, 'universal.db') },
  });
}

function cleanup(graphRoot, workspace) {
  fs.rmSync(graphRoot, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
}

test('engineer — sem --ref: contexto, architecture check e fluxo recomendado, sem seção de risco', () => {
  const graphRoot = createFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-engineer-workspace-'));
  try {
    const result = run('scripts/engineer.ts', ['refatorar auth', '--json'], graphRoot, workspace);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.objective, 'refatorar auth');
    assert.equal('risk' in report, false, 'sem --ref não deve inventar uma seção de risco');
    assert.ok(report.architectureCheck.note, 'constitution não compilada ainda deve virar uma nota, não erro');
    assert.equal(report.recommendedFlow.length, 6, 'as 6 etapas de docs/fluxo.md');
    assert.equal(report.recommendedFlow[0].etapa, 'Entender');
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('engineer --ref: inclui risco real e architecture:check real (constitution compilada)', () => {
  const graphRoot = createFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-engineer-workspace-'));
  try {
    const compile = run('scripts/architecture.ts', ['compile'], graphRoot, workspace);
    assert.equal(compile.status, 0, compile.stderr);

    fs.writeFileSync(path.join(graphRoot, 'packages', 'auth', 'src', 'index.ts'), 'export function login() { return false; }\n');
    git(['add', '.'], graphRoot);
    git(['commit', '-qm', 'muda auth'], graphRoot);

    const result = run('scripts/engineer.ts', ['refatorar auth', '--ref', 'HEAD', '--json'], graphRoot, workspace);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ref, 'HEAD');
    assert.ok(report.risk, 'com --ref deve incluir um assessment de risco real');
    assert.ok(typeof report.risk.score === 'number');
    assert.equal(report.architectureCheck.compliant, 1, 'constitution compilada — sem a nota de "não compilada ainda"');
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('engineer — texto legível (sem --json) contém todas as seções', () => {
  const graphRoot = createFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-engineer-workspace-'));
  try {
    const result = run('scripts/engineer.ts', ['refatorar auth'], graphRoot, workspace);
    assert.equal(result.status, 0, result.stderr);
    for (const heading of ['CONTEXTO', 'ADRs/SPECs RELEVANTES', 'ARCHITECTURE CHECK', 'RISCO', 'FLUXO RECOMENDADO']) {
      assert.match(result.stdout, new RegExp(heading));
    }
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('evidence:show — recupera um run real persistido, com approvals e audit records associados', async () => {
  const graphRoot = createFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-engineer-workspace-'));
  try {
    const dbPath = path.join(workspace, 'universal.db');
    fs.mkdirSync(workspace, { recursive: true });
    const { default: Database } = await import('better-sqlite3');
    const { SqliteMigrationRunner, SqliteRuntimeRunStore, SqliteAuditStore, SqliteApprovalStore } = await import('../packages/adapter-sqlite/src/index.ts');
    const { ApprovalLedger } = await import('../packages/policy/src/index.ts');
    const database = new Database(dbPath);
    new SqliteMigrationRunner(database).apply();
    const now = new Date().toISOString();
    const runtimeRun = {
      schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'run-fixture',
      runId: 'run-fixture', objective: 'corrigir auth', agent: { id: 'agent-1', name: 'worker', role: 'developer', autonomy: 'supervised' },
      policy: { effect: 'ALLOW', reason: 'ok', policyId: 'p1' }, budget: { totalTokens: 100, usedTokens: 10 },
      state: 'completed', steps: 2, evidence: [], changedFiles: ['packages/auth/src/index.ts'], metrics: { tokensUsed: 10, durationMs: 100 },
    };
    new SqliteRuntimeRunStore(database).save(runtimeRun);
    new SqliteAuditStore(database).append({ schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'run-fixture', id: 'ar-1', action: 'write', aggregateId: 'run-fixture', outcome: 'success', evidenceIds: [], details: {} });
    const ledger = new ApprovalLedger(new SqliteApprovalStore(database));
    const request = ledger.create({ action: 'write', justification: 'j', impact: 'i', expiresAt: '2099-01-01T00:00:00.000Z', correlationId: 'run-fixture' }, now);
    ledger.decide(request.id, { decision: 'approved', approverId: 'reviewer-1', decidedAt: now });
    database.close();

    const result = run('scripts/evidence.ts', ['show', 'run-fixture'], graphRoot, workspace);
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout);
    assert.equal(record.run.runId, 'run-fixture');
    assert.equal(record.intent, 'corrigir auth');
    assert.equal(record.auditRecords.length, 1);
    assert.equal(record.approvals.length, 1);
    assert.equal(record.approvals[0].decision, 'approved');
    assert.equal('architectureCheck' in record, false, 'evidence:show não roda architecture:check sozinho — só o que já foi persistido');
  } finally {
    cleanup(graphRoot, workspace);
  }
});

test('evidence:show — recusa run-id inexistente', () => {
  const graphRoot = createFixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-engineer-workspace-'));
  try {
    const result = run('scripts/evidence.ts', ['show', 'run-que-nao-existe'], graphRoot, workspace);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /não encontrado/);
  } finally {
    cleanup(graphRoot, workspace);
  }
});
