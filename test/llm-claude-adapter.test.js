import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import Database from 'better-sqlite3';
import { SqliteMigrationRunner, SqliteJsonRepository } from '../packages/adapter-sqlite/src/index.ts';
import { buildLlmExecution, RESUME_PROVIDERS } from '../packages/llm/src/index.ts';
import { normalizeClaudeResult } from '../lib/llm/claude-output.ts';
import { LlmSessionStore } from '../lib/llm/session.ts';

const claudeProfile = { provider: 'claude', model: 'default', command: 'claude', roles: ['sdd-architect'], taskTypes: ['analysis'], privacy: 'external', enabled: true };

// --- AC-1 / AC-2 : buildLlmExecution + RESUME_PROVIDERS -------------------

test('SPEC-050: RESUME_PROVIDERS = { codex, claude }', () => {
  assert.ok(RESUME_PROVIDERS.has('codex'));
  assert.ok(RESUME_PROVIDERS.has('claude'));
  assert.ok(!RESUME_PROVIDERS.has('ollama'));
});

test('SPEC-050: buildLlmExecution claude — --output-format json; --resume só com id', () => {
  const plain = buildLlmExecution(claudeProfile, 'oi');
  assert.deepEqual(plain.args, ['-p', 'oi', '--output-format', 'json']);
  assert.equal(plain.stdin, undefined); // prompt por argumento, não stdin

  const resumed = buildLlmExecution(claudeProfile, 'oi', { resume: 'sess-abc-123' });
  assert.deepEqual(resumed.args, ['-p', 'oi', '--output-format', 'json', '--resume', 'sess-abc-123']);

  assert.throws(() => buildLlmExecution({ ...claudeProfile, provider: 'gemini-cli' }, 'x', { resume: 'sess-1' }), /resume/);
});

// --- AC-3 : normalizeClaudeResult ---------------------------------------

test('SPEC-050: normalizeClaudeResult — objeto de sucesso', () => {
  const r = normalizeClaudeResult({ exitCode: 0, stderr: '', stdout: JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, result: 'a resposta',
    session_id: 'uuid-1', usage: { input_tokens: 12, output_tokens: 4, cache_read_input_tokens: 3 },
  }) });
  assert.equal(r.stdout, 'a resposta');
  assert.equal(r.sessionId, 'uuid-1');
  assert.deepEqual(r.usage, { inputTokens: 12, outputTokens: 4, cachedInputTokens: 3 });
  assert.equal(r.exitCode, 0);
  assert.equal(r.errorCode, undefined);
});

test('SPEC-050: normalizeClaudeResult — is_error e subtype ruim → PROVIDER_FAILED', () => {
  const a = normalizeClaudeResult({ exitCode: 0, stderr: '', stdout: JSON.stringify({ type: 'result', is_error: true, result: 'x' }) });
  assert.equal(a.errorCode, 'PROVIDER_FAILED');
  assert.equal(a.exitCode, 1);
  const b = normalizeClaudeResult({ exitCode: 0, stderr: '', stdout: JSON.stringify({ type: 'result', subtype: 'error_max_turns', result: 'x' }) });
  assert.equal(b.errorCode, 'PROVIDER_FAILED');
});

test('SPEC-050: normalizeClaudeResult — JSON inválido / sem result → INVALID_PROVIDER_OUTPUT', () => {
  assert.equal(normalizeClaudeResult({ exitCode: 0, stderr: '', stdout: 'não é json' }).errorCode, 'INVALID_PROVIDER_OUTPUT');
  assert.equal(normalizeClaudeResult({ exitCode: 0, stderr: '', stdout: JSON.stringify({ type: 'result' }) }).errorCode, 'INVALID_PROVIDER_OUTPUT');
});

// --- AC-2 : LlmSessionStore.require aceita claude ----------------------

test('SPEC-050: LlmSessionStore.require aceita claude', () => {
  const db = new Database(':memory:');
  try {
    new SqliteMigrationRunner(db).apply();
    const store = new LlmSessionStore(new SqliteJsonRepository(db));
    store.save('sess-1', claudeProfile, process.cwd(), 'obs-1');
    assert.equal(store.require('sess-1', claudeProfile, process.cwd()).observationId, 'obs-1');
  } finally { db.close(); }
});

// --- AC-6 : doctor reporta features para claude ----------------------

test('SPEC-050: llm:probe reporta features.resume=true, outputSchema=false para claude', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-claude-probe-'));
  const root = path.resolve(import.meta.dirname, '..');
  const forja = (args) => spawnSync(process.execPath, [path.join(root, 'bin', 'forja.ts'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, FORJA_WORKSPACE: ws } });
  // fixture executável: --version → disponível; --help → menciona --resume (schema NÃO).
  const fakeClaude = path.join(ws, 'fake-claude');
  fs.writeFileSync(fakeClaude, `#!/bin/sh
case "$1" in
  --version) echo "9.9.9 (fake claude)"; exit 0 ;;
  --help) printf -- "--print\\n--output-format <format>\\n--resume [sessionId]\\n"; exit 0 ;;
esac
exit 0
`);
  fs.chmodSync(fakeClaude, 0o755);
  try {
    assert.equal(forja(['workspace:init']).status, 0);
    assert.equal(forja(['llm:profiles:init']).status, 0);
    const profilePath = path.join(ws, '.context', 'llm-profiles.json');
    const configured = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    configured.profiles.claude = { ...configured.profiles.claude, command: fakeClaude };
    fs.writeFileSync(profilePath, JSON.stringify(configured));

    const probe = forja(['llm:probe', 'claude']);
    assert.equal(probe.status, 0, probe.stderr);
    const item = JSON.parse(probe.stdout).profiles.find((p) => p.name === 'claude');
    assert.equal(item.available, true);
    assert.equal(item.features.resume, true);
    assert.equal(item.features.outputSchema, false);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});
