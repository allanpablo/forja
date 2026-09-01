import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_LLM_PROFILES, buildLlmExecution, recommendProfile, runLlm, validateProfiles } from '../packages/llm/src/index.ts';

test('LLM profiles reject shell-like commands and preserve an explicit adapter contract', () => {
  assert.throws(() => validateProfiles({ version: 1, profiles: { invalid: { provider: 'x', model: 'x', command: 'tool --unsafe', commandArgs: [], roles: [], taskTypes: [], privacy: 'local', enabled: true } } }), /one executable/);
  const profiles = validateProfiles(DEFAULT_LLM_PROFILES);
  assert.equal(profiles.profiles.codex.command, 'codex');
});

test('known adapters build argv without a shell', () => {
  const execution = buildLlmExecution({ provider: 'ollama', model: 'qwen2.5-coder', command: 'ollama', roles: [], taskTypes: ['offline'], privacy: 'local', enabled: true }, 'responda apenas ok');
  assert.equal(execution.executable, 'ollama');
  assert.deepEqual(execution.args, ['run', 'qwen2.5-coder', 'responda apenas ok']);
});

test('recommendation uses declared role/task fit before local evidence', () => {
  const recommendation = recommendProfile(DEFAULT_LLM_PROFILES, [{ model: 'ollama:llama3.3', outcome: 'succeeded', durationMs: 10 }], 'orchestrator', 'orchestration');
  assert.equal(recommendation[0].name, 'codex');
  assert.ok(recommendation[0].reasons.includes('role:orchestrator'));
});

test('CLI initializes workspace-local profiles and recommends a compatible profile', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-llm-fit-'));
  const root = path.resolve(import.meta.dirname, '..');
  const run = (args) => spawnSync(process.execPath, [path.join(root, 'bin', 'forja.ts'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, FORJA_WORKSPACE: workspace } });
  try {
    assert.equal(run(['workspace:init']).status, 0);
    assert.equal(run(['llm:profiles:init']).status, 0);
    const recommended = run(['llm:recommend', '--role', 'orchestrator', '--task', 'orchestration']);
    assert.equal(recommended.status, 0);
    assert.equal(JSON.parse(recommended.stdout).recommendations[0].name, 'codex');
    assert.ok(fs.existsSync(path.join(workspace, '.context', 'llm-profiles.json')));

    const profilePath = path.join(workspace, '.context', 'llm-profiles.json');
    const configured = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    configured.profiles.fixture = {
      provider: 'fixture', model: 'v1', command: process.execPath,
      commandArgs: ['-e', 'process.stdout.write("fixture output")'], roles: ['worker'],
      taskTypes: ['test'], privacy: 'local', enabled: true,
    };
    fs.writeFileSync(profilePath, JSON.stringify(configured));
    const executed = run(['llm:run', '--profile', 'fixture', '--prompt', 'do not persist this prompt']);
    assert.equal(executed.status, 0);
    assert.equal(JSON.parse(executed.stdout).exitCode, 0);
    const audit = fs.readFileSync(path.join(workspace, '.context', 'forja-runs.jsonl'), 'utf8');
    assert.ok(!audit.includes('do not persist this prompt'));
    assert.ok(audit.includes('<redacted>'));
    const evaluation = run(['llm:eval', '--scope', 'model', '--id', 'fixture:v1']);
    assert.equal(evaluation.status, 0);
    assert.equal(JSON.parse(evaluation.stdout).metrics.observationCount, 1);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// A CLI tool that ignores SIGTERM (or a runaway grandchild it spawned) must not survive a
// runLlm timeout — bare child.kill() alone can leave it running (and, for API-backed
// providers, still accruing cost) after Forja has already moved on.
test('runLlm derruba com SIGKILL um subprocesso que ignora SIGTERM após o timeout', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-llm-kill-'));
  const pidFile = path.join(tmp, 'pid');
  try {
    const script = `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`;
    const result = await runLlm({ executable: process.execPath, args: ['-e', script] }, process.cwd(), 200);
    assert.equal(result.errorCode, 'TIMEOUT');

    // runLlm resolves as soon as SIGTERM is sent (doesn't block the caller on the kill sequence);
    // give the SIGTERM-grace → SIGKILL escalation time to actually land before checking liveness.
    await new Promise((resolve) => setTimeout(resolve, 4_000));

    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    assert.throws(() => process.kill(pid, 0), /ESRCH/, 'processo que ignora SIGTERM deveria ter sido derrubado com SIGKILL');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
