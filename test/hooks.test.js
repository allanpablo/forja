import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

test('session-start: núcleo quebrado vira aviso, não crash (SPEC-009)', () => {
  // Workspace inexistente → universal.db ausente → memory-db falha como crítico. Quebra real,
  // sem env var de conveniência. O hook reporta; o gate é o tools:doctor. Uma sessão que não abre
  // porque o diagnóstico estourou é o pior resultado possível (ADR-0021).
  const res = runHook('hook-session-start.mjs', {}, {
    FORJA_WORKSPACE: path.join(os.tmpdir(), `forja-inexistente-${Date.now()}`),
  });

  assert.equal(res.status, 0, 'exit 0 mesmo com o núcleo quebrado');
  const ctx = JSON.parse(res.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /✖/, 'a falha crítica aparece no briefing');
  assert.match(ctx, /sync:universal/, 'com a correção ao lado');
  assert.match(ctx, /Specs ativas/, 'e o resto do briefing sobrevive');
});

test('session-start: não prescreve `npm install` para ABI quebrado (AC-8)', () => {
  // A prescrição errada que motivou a SPEC-009: `npm install` não recompila binário nativo.
  const src = fs.readFileSync(path.join(root, 'scripts', 'hook-session-start.mjs'), 'utf8');

  assert.doesNotMatch(src, /Rode `npm install`/, 'a prescrição errada não pode voltar');
  assert.doesNotMatch(src, /function staleIndex/, 'heurística local removida — a lib é a fonte');
  assert.doesNotMatch(src, /function resolveDbPath/, 'o catch que colapsava as três causas saiu');
  assert.match(src, /runChecks/, 'consome lib/core/health.mjs');
});
