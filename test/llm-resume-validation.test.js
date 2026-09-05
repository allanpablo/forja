import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { SqliteMigrationRunner, SqliteObservationStore, SqliteJsonRepository } from '../packages/adapter-sqlite/src/index.ts';
import { DEFAULT_LLM_PROFILES, buildLlmExecution } from '../packages/llm/src/index.ts';
import { LlmSessionStore } from '../lib/llm/session.ts';
import { prepareValidation, validateLlmResponse } from '../lib/llm/validation.ts';

const root = path.resolve(import.meta.dirname, '..');
const profile = { ...DEFAULT_LLM_PROFILES.profiles.codex, model: 'gpt-6-astra' };
const schema = { type: 'object', properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false };
const workspace = () => fs.mkdtempSync(path.join(os.tmpdir(), 'forja-llm-resume-'));

test('resume usa ID explícito e preserva permissões antes e depois do subcomando', () => {
  const execution = buildLlmExecution(profile, 'continuação', { resume: 'session-1', outputSchema: '/tmp/contract.json' });
  assert.equal(execution.stdin, 'continuação');
  assert.equal(execution.args.at(-2), 'session-1');
  assert.equal(execution.args.at(-1), '-');
  assert.ok(execution.args.indexOf('--sandbox') < execution.args.indexOf('resume'));
  assert.ok(execution.args.includes('sandbox_mode="read-only"'));
  assert.ok(execution.args.includes('approval_policy="never"'));
  assert.ok(execution.args.includes('--output-schema'));
  for (const id of ['', '--last', '../session', 'a b']) assert.throws(() => buildLlmExecution(profile, 'x', { resume: id }), /resume/);
  assert.throws(() => buildLlmExecution({ ...profile, provider: 'claude' }, 'x', { resume: 'session-1' }), /resume/);
});

test('sessões são isoladas por projeto e identidade do perfil', () => {
  const tmp = workspace();
  const db = new Database(':memory:');
  try {
    new SqliteMigrationRunner(db).apply();
    const repository = new SqliteJsonRepository(db);
    const sessions = new LlmSessionStore(repository);
    sessions.save('session-1', profile, tmp, 'obs-1');
    assert.equal(sessions.require('session-1', { ...profile, reasoningEffort: 'high', timeoutMs: 500 }, tmp).observationId, 'obs-1');
    assert.throws(() => sessions.require('unknown', profile, tmp), /não registrada/);
    assert.throws(() => sessions.require('session-1', profile, root), /outro projeto/);
    for (const change of [{ model: 'other' }, { command: 'other' }, { commandArgs: ['--other'] }, { privacy: 'local' }]) {
      assert.throws(() => sessions.require('session-1', { ...profile, ...change }, tmp), /configuração de perfil/);
    }
    assert.throws(() => sessions.save('session-1', { ...profile, model: 'other' }, tmp, 'obs-2'), /configuração de perfil/);
    assert.deepEqual(Object.keys(repository.get('llm_session', 'session-1')).sort(), ['cwd', 'id', 'observationId', 'profileHash', 'updatedAt'].sort());
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('schema valida estrutura sem coerção e não aprova uma tarefa sozinho', async () => {
  const tmp = workspace();
  const file = path.join(tmp, 'schema.json');
  try {
    for (const draft of [undefined, 'https://json-schema.org/draft/2020-12/schema']) {
      fs.writeFileSync(file, JSON.stringify({ ...schema, ...(draft ? { $schema: draft } : {}) }));
      const prepared = prepareValidation(file);
      const accepted = await validateLlmResponse(prepared, '{"result":"ok"}', tmp, true);
      assert.equal(accepted.status, 'inconclusive');
      assert.equal(accepted.formatStatus, 'accepted');
      assert.equal((await validateLlmResponse(prepared, '{"result":7}', tmp, true)).errorCode, 'RESPONSE_SCHEMA_MISMATCH');
      assert.equal((await validateLlmResponse(prepared, 'not JSON', tmp, true)).errorCode, 'INVALID_RESPONSE_JSON');
      assert.equal((await validateLlmResponse(prepared, '{"result":"ok","extra":true}', tmp, true)).status, 'rejected');
    }
    for (const invalid of [{ $async: true, ...schema }, { $ref: 'https://example.com/remote-schema' }, { type: 'unknown-type' }]) {
      fs.writeFileSync(file, JSON.stringify(invalid));
      assert.throws(() => prepareValidation(file));
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('checks consomem a resposta como dados, registram hashes e respeitam falha e timeout', async () => {
  const tmp = workspace();
  const manifestFile = path.join(tmp, 'checks.json');
  const schemaFile = path.join(tmp, 'schema.json');
  const marker = path.join(tmp, 'marker');
  const check = { name: 'requirement', command: process.execPath, args: ['-e', 'const s=require("fs").readFileSync(0,"utf8"); process.stdout.write("private check log"); process.exit(s.includes("expected") ? 0 : 1)'] };
  try {
    fs.writeFileSync(manifestFile, JSON.stringify({ version: 1, checks: [check] }));
    let prepared = prepareValidation(undefined, manifestFile);
    const accepted = await validateLlmResponse(prepared, 'expected; $(touch should-not-execute)', tmp, true);
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.checks[0].exitCode, 0);
    assert.ok(!JSON.stringify(accepted).includes('private check log'));
    assert.equal(fs.existsSync(path.join(tmp, 'should-not-execute')), false);
    assert.equal((await validateLlmResponse(prepared, 'wrong', tmp, true)).status, 'rejected');
    const spawnCheck = { name: 'marker', command: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`] };
    fs.writeFileSync(schemaFile, JSON.stringify(schema));
    fs.writeFileSync(manifestFile, JSON.stringify({ version: 1, checks: [spawnCheck] }));
    prepared = prepareValidation(schemaFile, manifestFile);
    assert.equal((await validateLlmResponse(prepared, 'not JSON', tmp, true)).status, 'rejected');
    assert.equal((await validateLlmResponse(prepared, '{}', tmp, false)).status, 'blocked');
    assert.equal(fs.existsSync(marker), false);
    fs.writeFileSync(manifestFile, JSON.stringify({ version: 1, checks: [{ ...check, args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 100 }] }));
    const timeout = await validateLlmResponse(prepareValidation(undefined, manifestFile), '', tmp, true);
    assert.equal(timeout.status, 'rejected');
    assert.equal(timeout.checks[0].errorCode, 'TIMEOUT');
    assert.equal(timeout.checks[0].exitCode, 124);
    for (const checks of [[], [check, check], [{ ...check, timeoutMs: 0 }], [{ ...check, unexpected: true }]]) {
      fs.writeFileSync(manifestFile, JSON.stringify({ version: 1, checks }));
      assert.throws(() => prepareValidation(undefined, manifestFile));
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('CLI retoma sem replay e persiste evidências independentes sem conteúdo', () => {
  const tmp = workspace();
  const fixture = path.join(tmp, 'codex.mjs');
  const calls = path.join(tmp, 'calls.jsonl');
  const manifestFile = path.join(tmp, 'checks.json');
  const schemaFile = path.join(tmp, 'schema.json');
  const profilesFile = path.join(tmp, '.context/llm-profiles.json');
  const invoke = (args, cwd = root) => spawnSync(process.execPath, [path.join(root, 'bin/forja.ts'), ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, FORJA_WORKSPACE: tmp, FORJA_FIXTURE_CALLS: calls },
  });
  try {
    fs.writeFileSync(fixture, `#!${process.execPath}\nimport fs from 'node:fs';
const prompt=fs.readFileSync(0,'utf8');
fs.appendFileSync(process.env.FORJA_FIXTURE_CALLS,JSON.stringify({args:process.argv.slice(2),prompt})+'\\n');
const response=prompt.includes('bad-type') ? {result:7} : {result:prompt.includes('bad-requirement') ? 'wrong' : 'ok'};
for(const event of [{type:'thread.started',thread_id:'session-1'},
{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(response)}},
{type:'turn.completed',usage:{input_tokens:10,output_tokens:5}}]) console.log(JSON.stringify(event));
`);
    fs.chmodSync(fixture, 0o755);
    assert.equal(invoke(['workspace:init']).status, 0);
    const configured = { version: 1, profiles: { codex: { ...profile, command: fixture } } };
    fs.writeFileSync(profilesFile, JSON.stringify(configured));
    fs.writeFileSync(schemaFile, JSON.stringify(schema));
    fs.writeFileSync(manifestFile, JSON.stringify({ version: 1, checks: [{ name: 'result-is-ok', command: process.execPath,
      args: ['-e', 'const response=JSON.parse(require("fs").readFileSync(0,"utf8")); process.stdout.write("private validation log"); process.exit(response.result==="ok" ? 0 : 1)'] }] }));
    const common = ['llm:run', '--profile', 'codex', '--output-schema', schemaFile, '--validation', manifestFile];
    const schemaText = fs.readFileSync(schemaFile, 'utf8');
    fs.writeFileSync(schemaFile, JSON.stringify({ type: 'invalid-type' }));
    assert.notEqual(invoke([...common, '--prompt', 'must not start']).status, 0);
    assert.equal(fs.existsSync(calls), false);
    fs.writeFileSync(schemaFile, schemaText);
    assert.notEqual(invoke([...common, '--prompt', 'must not start', '--unknown', 'option']).status, 0);
    assert.equal(fs.existsSync(calls), false);
    const first = invoke([...common, '--prompt', 'first private request']);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).validationStatus, 'accepted');
    const next = invoke([...common, '--resume', 'session-1', '--prompt', 'second private request']);
    assert.equal(next.status, 0, next.stderr);
    assert.equal(JSON.parse(next.stdout).resumedFrom, 'session-1');
    let captured = fs.readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(captured.length, 2);
    assert.ok(captured[1].args.includes('resume'));
    assert.ok(captured[1].prompt.includes('second private request'));
    assert.ok(!captured[1].prompt.includes('first private request'));
    assert.equal(captured[1].args.at(-2), 'session-1');
    for (const [extra, cwd] of [[['--resume', 'unknown'], root], [['--resume', 'session-1'], tmp]]) {
      const failed = invoke([...common, ...extra, '--prompt', 'do not execute'], cwd);
      assert.notEqual(failed.status, 0);
    }
    configured.profiles.codex.model = 'other';
    fs.writeFileSync(profilesFile, JSON.stringify(configured));
    assert.notEqual(invoke([...common, '--resume', 'session-1', '--prompt', 'do not execute']).status, 0);
    configured.profiles.codex.model = profile.model;
    fs.writeFileSync(profilesFile, JSON.stringify(configured));
    captured = fs.readFileSync(calls, 'utf8').trim().split('\n');
    assert.equal(captured.length, 2, 'rejected resumes must not launch the provider');

    for (const prompt of ['bad-type', 'bad-requirement']) {
      const failed = invoke([...common, '--resume', 'session-1', '--prompt', prompt]);
      assert.equal(failed.status, 2, failed.stderr);
      const value = JSON.parse(failed.stdout);
      assert.equal(value.executionStatus, 'completed');
      assert.equal(value.executionExitCode, 0);
      assert.equal(value.validationStatus, 'rejected');
    }
    const report = JSON.parse(invoke(['llm:eval', '--scope', 'model', '--id', 'codex:gpt-6-astra']).stdout);
    assert.equal(report.metrics.successRate, 1);
    assert.equal(report.metrics.validationAcceptedCount, 2);
    assert.equal(report.metrics.validationRejectedCount, 2);
    assert.equal(report.metrics.validationSuccessRate, 0.5);
    const db = new Database(path.join(tmp, 'memory/sqlite/universal.db'));
    try {
      const records = new SqliteJsonRepository(db);
      const observations = new SqliteObservationStore(db).list();
      const evidence = records.list('llm_validation');
      assert.equal(evidence.length, 4);
      assert.ok(evidence.some((value) => value.checks.length === 1 && value.checks[0].passed));
      const persisted = JSON.stringify([observations, evidence, records.list('llm_session')]) + fs.readFileSync(path.join(tmp, '.context/forja-runs.jsonl'), 'utf8');
      for (const secret of ['first private request', 'second private request', 'private validation log', '{"result":"ok"}']) assert.ok(!persisted.includes(secret));
    } finally { db.close(); }

    // A provider returning a new session during resume must not silently replace the selected session.
    fs.writeFileSync(fixture, `#!${process.execPath}\nfor(const event of [{type:'thread.started',thread_id:'different-session'}, {type:'turn.completed'}]) console.log(JSON.stringify(event));\n`);
    const mismatch = invoke([...common, '--resume', 'session-1', '--prompt', 'continue']);
    assert.notEqual(mismatch.status, 0);
    assert.equal(JSON.parse(mismatch.stdout).errorCode, 'SESSION_MISMATCH');
    assert.equal(JSON.parse(mismatch.stdout).validationStatus, 'blocked');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
