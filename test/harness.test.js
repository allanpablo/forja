import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// PATH sem ~/.local/bin → o binario `codegraph` fica indisponivel,
// exercitando a degradacao graciosa (ADR-0017/0018).
const NO_TOOLS_ENV = { ...process.env, PATH: '/nonexistent' };

function run(scriptArgs, env = process.env) {
  return spawnSync(process.execPath, scriptArgs, { cwd: root, encoding: 'utf8', env });
}

test('code:check degrada sem travar quando codegraph ausente', () => {
  const r = run(['scripts/agent-harness.ts', 'code:check'], NO_TOOLS_ENV);
  assert.equal(r.status, 0, 'deve sair 0 (nao-bloqueante) sem codegraph');
  assert.match(r.stdout, /nao instalado/i);
});

test('code-intel.mjs (template emitido) tambem degrada sem codegraph', () => {
  const r = run(['lib/templates/harness/code-intel.mjs', 'check'], NO_TOOLS_ENV);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /nao instalado/i);
});

test('code:impact sem simbolo retorna erro de uso', () => {
  const r = run(['scripts/agent-harness.ts', 'code:impact']);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /Uso:/);
});

test('code:impact sem codegraph oferece fallback manual', () => {
  const r = run(['scripts/agent-harness.ts', 'code:impact', 'algumSimbolo'], NO_TOOLS_ENV);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Fallback manual/i);
});

test('tools:doctor lista as 5 ferramentas e nao trava sem nenhuma', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-doctor-'));
  try {
    const r = run(['scripts/tools-doctor.ts'], { ...NO_TOOLS_ENV, FORJA_WORKSPACE: workspace });
    assert.equal(r.status, 0);
    for (const name of ['codegraph', 'gitleaks', 'ast-grep', 'lefthook', 'markdownlint']) {
      assert.ok(r.stdout.includes(name), `esperava ${name} no relatorio`);
    }
    assert.match(r.stdout, /0\/5 ferramentas/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('gsd:handoff resolve agent-router apos migracao para TypeScript', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-handoff-'));
  try {
    const r = run(
      ['scripts/agent-harness.ts', 'gsd:handoff', 'spec', 'fixture-router-ts'],
      { ...process.env, FORJA_WORKSPACE: workspace }
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /"intent":"spec"/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('design:check rejeita brief lido de diretorio irmao (bypass do startsWith ingenuo)', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-designcheck-'));
  try {
    // Diretorio irmao cujo nome apenas compartilha o prefixo de string de `project` —
    // startsWith(projectRoot) aceitava isso; isPathWithinRoot deve rejeitar.
    const projectRoot = path.join(base, 'project');
    const evilDir = path.join(base, 'project-evil');
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(evilDir, { recursive: true });
    fs.writeFileSync(path.join(evilDir, 'secret.md'), '# not the users brief');

    const r = spawnSync(process.execPath, [path.join(root, 'scripts/agent-harness.ts'), 'design:check', '../project-evil/secret.md'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr + r.stdout, /Caminho fora do projeto/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('design:check ainda le um brief legitimo dentro do projeto', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-designcheck-ok-'));
  try {
    const briefPath = path.join(base, 'brief.md');
    fs.writeFileSync(briefPath, '# brief incompleto de proposito');

    const r = spawnSync(process.execPath, [path.join(root, 'scripts/agent-harness.ts'), 'design:check', 'brief.md'], {
      cwd: base,
      encoding: 'utf8',
    });
    // Conteudo incompleto falha por campos ausentes, nao pelo guardrail de caminho.
    assert.doesNotMatch(r.stderr + r.stdout, /Caminho fora do projeto/);
    assert.match(r.stdout, /Campos ausentes/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
