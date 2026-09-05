import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { SqliteObservationStore } from '../packages/adapter-sqlite/src/index.ts';
import { DEFAULT_LLM_PROFILES, buildLlmExecution, validateProfiles } from '../packages/llm/src/index.ts';
import { buildContextPrompt } from '../lib/llm/context.ts';
import { normalizeCodexResult } from '../lib/llm/codex-output.ts';

const root = path.resolve(import.meta.dirname, '..');
const codex = { ...DEFAULT_LLM_PROFILES.profiles.codex, model: 'gpt-6-astra', reasoningEffort: 'high', timeoutMs: 300_000 };
const normalize = (events, overrides = {}) => normalizeCodexResult({ stdout: events.map((event) => JSON.stringify(event)).join('\n'), stderr: '', exitCode: 0, durationMs: 10, ...overrides });

test('perfil GPT-6 usa stdin, JSONL e configuração de aprovação compatível com exec', () => {
  const profile = validateProfiles({ version: 1, profiles: { codex } }).profiles.codex;
  const result = buildLlmExecution(profile, 'conteúdo privado');
  assert.equal(result.stdin, 'conteúdo privado');
  assert.ok(!result.args.includes('conteúdo privado'));
  assert.ok(!result.args.includes('--ask-for-approval'));
  assert.ok(result.args.includes('--json'));
  assert.ok(result.args.includes('approval_policy="never"'));
  assert.ok(result.args.includes('model_reasoning_effort="high"'));
  assert.equal(result.args[result.args.indexOf('--model') + 1], 'gpt-6-astra');
  assert.equal(result.args[result.args.indexOf('--sandbox') + 1], 'read-only');
});

test('validação preserva argv posicional e rejeita opções inválidas', () => {
  const args = ['-c', 'first=1', '-c', 'second=2', ' whitespace '];
  const checked = validateProfiles({ version: 1, profiles: { codex: { ...codex, commandArgs: args } } });
  assert.deepEqual(checked.profiles.codex.commandArgs, args);
  for (const timeoutMs of [0, -1, 0.5, Infinity, '100', 2_147_483_648]) {
    assert.throws(() => validateProfiles({ version: 1, profiles: { codex: { ...codex, timeoutMs } } }), /timeoutMs/);
  }
  for (const override of [{ reasoningEffort: 'invalid' }, { provider: 'claude' }]) {
    assert.throws(() => validateProfiles({ version: 1, profiles: { codex: { ...codex, ...override } } }), /reasoningEffort/);
  }
});

test('Codex normaliza sessão, resposta e uso, omitindo eventos internos', () => {
  const result = normalize([
    { type: 'thread.started', thread_id: 'session-fixture' },
    { type: 'item.completed', item: { type: 'reasoning', text: 'internal fixture' } },
    { type: 'future.event', arbitrary: true },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Resposta final' } },
    { type: 'turn.completed', usage: { input_tokens: 900, output_tokens: 25, cached_input_tokens: 700 } },
  ]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.sessionId, 'session-fixture');
  assert.equal(result.stdout, 'Resposta final');
  assert.deepEqual(result.usage, { inputTokens: 900, outputTokens: 25, cachedInputTokens: 700 });
});

test('exit zero não mascara falha, stream incompleto ou telemetria inválida', () => {
  assert.equal(normalize([{ type: 'turn.failed' }]).errorCode, 'PROVIDER_FAILED');
  assert.equal(normalize([{ type: 'error' }, { type: 'turn.completed' }]).exitCode, 1);
  assert.equal(normalize([]).errorCode, 'INCOMPLETE_PROVIDER_OUTPUT');
  assert.equal(normalize([], { stdout: 'not json' }).errorCode, 'INVALID_PROVIDER_OUTPUT');
  assert.equal(normalize([{ type: 'turn.completed', usage: { input_tokens: -1, output_tokens: 1 } }]).errorCode, 'INVALID_PROVIDER_OUTPUT');
  assert.equal(normalize([{ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1, cached_input_tokens: 2 } }]).exitCode, 1);
  assert.equal(normalize([], { exitCode: 124, errorCode: 'TIMEOUT' }).errorCode, 'TIMEOUT');
  assert.equal(normalize([{ type: 'turn.completed' }]).usage, undefined);
});

test('contexto é deduplicado em ordem e falha antes de iniciar o provedor', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-context-'));
  try {
    fs.writeFileSync(path.join(tmp, 'a.md'), 'contexto A');
    fs.writeFileSync(path.join(tmp, 'b.md'), 'contexto B');
    const result = buildContextPrompt('tarefa', ['a.md', './a.md', 'b.md'], tmp);
    assert.deepEqual(result.refs, [path.join(tmp, 'a.md'), path.join(tmp, 'b.md')]);
    assert.ok(result.prompt.indexOf('contexto A') < result.prompt.indexOf('contexto B'));
    assert.equal(result.prompt.split('contexto A').length, 2);
    assert.throws(() => buildContextPrompt('tarefa', ['missing.md'], tmp), /ENOENT/);
    assert.throws(() => buildContextPrompt('tarefa', ['.'], tmp), /não é um arquivo/);
    assert.deepEqual(buildContextPrompt('tarefa', [], tmp), { prompt: 'tarefa', refs: [] });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('CLI integra contexto, metadados Codex, falhas e doctor sem rede', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-llm-integration-'));
  const captured = path.join(workspace, 'captured.json');
  const fixture = path.join(workspace, 'codex-fixture.mjs');
  const run = (args) => spawnSync(process.execPath, [path.join(root, 'bin/forja.ts'), ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, FORJA_WORKSPACE: workspace, FORJA_FIXTURE_CAPTURE: captured },
  });
  try {
    fs.writeFileSync(fixture, `#!${process.execPath}\nimport fs from 'node:fs';
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('codex fixture'); process.exit(0); }
if (args.includes('--help')) { console.log('--json --sandbox --config'); process.exit(0); }
const prompt = fs.readFileSync(0, 'utf8');
fs.writeFileSync(process.env.FORJA_FIXTURE_CAPTURE, JSON.stringify({ args, prompt }));
for (const event of [
  { type: 'thread.started', thread_id: 'session-fixture' },
  { type: 'item.completed', item: { type: 'agent_message', text: 'resposta privada fixture' } },
  { type: 'turn.completed', usage: { input_tokens: 900, output_tokens: 25, cached_input_tokens: 700 } }
]) console.log(JSON.stringify(event));
`);
    fs.chmodSync(fixture, 0o755);
    assert.equal(run(['workspace:init']).status, 0);
    const profilesFile = path.join(workspace, '.context/llm-profiles.json');
    fs.writeFileSync(profilesFile, JSON.stringify({ version: 1, profiles: { codex: { ...codex, command: fixture } } }));
    const contextFile = path.join(workspace, 'brief.md');
    fs.writeFileSync(contextFile, 'desejo privado do produto');

    const probe = run(['llm:doctor', 'codex']);
    assert.equal(probe.status, 0, probe.stderr);
    assert.equal(JSON.parse(probe.stdout).profiles[0].compatible, true);
    assert.equal(JSON.parse(probe.stdout).profiles[0].modelAccess, 'not-probed');
    assert.equal(fs.existsSync(captured), false);

    const missing = run(['llm:run', '--profile', 'codex', '--prompt', 'tarefa', '--context', `${contextFile}.missing`]);
    assert.notEqual(missing.status, 0);
    assert.equal(fs.existsSync(captured), false);
    const executed = run(['llm:run', '--profile', 'codex', '--prompt', 'instrução privada', '--context', contextFile]);
    assert.equal(executed.status, 0, executed.stderr);
    const output = JSON.parse(executed.stdout);
    const sent = JSON.parse(fs.readFileSync(captured, 'utf8'));
    assert.ok(sent.prompt.includes('desejo privado do produto'));
    assert.equal(output.stdout, 'resposta privada fixture');
    assert.equal(output.executionStatus, 'completed');
    assert.equal(output.validationStatus, 'inconclusive');
    assert.equal(output.usage.source, 'provider');
    assert.equal(output.usage.inputTokens, 900);
    assert.equal(output.usage.cachedInputTokens, 700);
    assert.equal(output.sessionId, 'session-fixture');
    const db = new Database(path.join(workspace, 'memory/sqlite/universal.db'));
    try {
      const values = new SqliteObservationStore(db).list();
      assert.equal(values.length, 1);
      assert.equal(values[0].inputHash, createHash('sha256').update(sent.prompt).digest('hex'));
      assert.equal(values[0].validationStatus, 'inconclusive');
      assert.equal(values[0].inputTokens, 900);
      const persisted = JSON.stringify(values) + fs.readFileSync(path.join(workspace, '.context/forja-runs.jsonl'), 'utf8');
      for (const content of ['instrução privada', 'desejo privado do produto', 'resposta privada fixture']) assert.ok(!persisted.includes(content));
    } finally { db.close(); }

    fs.writeFileSync(fixture, `#!${process.execPath}\nconsole.log(JSON.stringify({ type: 'turn.failed' }));\n`);
    const failed = run(['llm:run', '--profile', 'codex', '--prompt', 'tarefa']);
    assert.notEqual(failed.status, 0);
    assert.equal(JSON.parse(failed.stdout).errorCode, 'PROVIDER_FAILED');
    assert.equal(JSON.parse(failed.stdout).executionStatus, 'failed');

    fs.writeFileSync(fixture, `#!${process.execPath}\nsetInterval(() => {}, 1000);\n`);
    fs.writeFileSync(profilesFile, JSON.stringify({ version: 1, profiles: { codex: { ...codex, command: fixture, timeoutMs: 100 } } }));
    const timeout = run(['llm:run', '--profile', 'codex', '--prompt', 'tarefa']);
    assert.equal(timeout.status, 124);
    assert.equal(JSON.parse(timeout.stdout).errorCode, 'TIMEOUT');

    fs.writeFileSync(fixture, `#!${process.execPath}\nconsole.log('old codex fixture');\n`);
    const incompatible = run(['llm:doctor', 'codex']);
    assert.notEqual(incompatible.status, 0);
    assert.equal(JSON.parse(incompatible.stdout).profiles[0].compatible, false);
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});
