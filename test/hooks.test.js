import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

/** Invoca um hook como o Claude Code invoca: payload JSON no stdin. */
function runHook(script, payload, env = {}) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', script)], {
    cwd: root,
    encoding: 'utf8',
    input: JSON.stringify(payload),
    env: { ...process.env, ...env },
  });
}

const GUARD = 'hook-guard-paths.mjs';

test('guard: bloqueia escrita em projects/ com motivo acionável', () => {
  const res = runHook(GUARD, { tool_input: { file_path: 'projects/app/main.ts' }, cwd: root });
  assert.equal(res.status, 2, 'exit 2 é o que bloqueia a ferramenta');
  assert.match(res.stderr, /off-limits/);
  assert.match(res.stderr, /project:new/, 'deve apontar a alternativa, não só negar');
});

test('guard: bloqueia docs/archive/ mesmo com path absoluto', () => {
  const abs = path.join(root, 'docs/archive/legacy-bin/x.js');
  const res = runHook(GUARD, { tool_input: { file_path: abs }, cwd: root });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /histórico congelado/);
});

test('guard: libera código vivo', () => {
  const res = runHook(GUARD, { tool_input: { file_path: 'lib/core/registry.mjs' }, cwd: root });
  assert.equal(res.status, 0);
  assert.equal(res.stderr, '');
});

test('guard: ignora arquivo fora do repo', () => {
  const res = runHook(GUARD, { tool_input: { file_path: '/tmp/projects/x.ts' }, cwd: root });
  assert.equal(res.status, 0);
});

test('guard: FORJA_GUARD=0 desliga o bloqueio', () => {
  const res = runHook(GUARD, { tool_input: { file_path: 'projects/x.ts' }, cwd: root }, { FORJA_GUARD: '0' });
  assert.equal(res.status, 0);
});

test('guard: falha aberta — payload inválido não trava a sessão', () => {
  const res = spawnSync(process.execPath, [path.join(root, 'scripts', GUARD)], {
    cwd: root, encoding: 'utf8', input: 'isto não é json',
  });
  assert.equal(res.status, 0);
});

const POST = 'hook-post-edit.mjs';

test('post-edit: ignora arquivo não vigiado sem rodar teste', () => {
  const res = runHook(POST, { tool_input: { file_path: 'README.md' }, cwd: root });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

test('post-edit: registry íntegro passa em silêncio', () => {
  const res = runHook(POST, { tool_input: { file_path: 'lib/core/registry.mjs' }, cwd: root });
  assert.equal(res.status, 0, `esperado 0, veio ${res.status}: ${res.stderr}`);
});

test('post-edit: FORJA_HOOK_TEST=0 desliga', () => {
  const res = runHook(POST, { tool_input: { file_path: 'package.json' }, cwd: root }, { FORJA_HOOK_TEST: '0' });
  assert.equal(res.status, 0);
});

test('session-start: nunca derruba a sessão e emite JSON válido', () => {
  const res = runHook('hook-session-start.mjs', {});
  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /<framework-status>/);
});
