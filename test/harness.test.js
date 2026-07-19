import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
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
  const r = run(['scripts/tools-doctor.ts'], NO_TOOLS_ENV);
  assert.equal(r.status, 0);
  for (const name of ['codegraph', 'gitleaks', 'ast-grep', 'lefthook', 'markdownlint']) {
    assert.ok(r.stdout.includes(name), `esperava ${name} no relatorio`);
  }
  assert.match(r.stdout, /0\/5 ferramentas/);
});
