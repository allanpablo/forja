import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'forja.ts');

function run(cwd, args) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', env: { ...process.env, FORJA_WORKSPACE: '' } });
}

test('dependency-style invocation stores LLM, audit and memory inside the consumer project', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-embedded-'));
  try {
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'consumer-project', private: true }));
    fs.mkdirSync(path.join(project, 'memory'), { recursive: true });
    fs.writeFileSync(path.join(project, 'memory', 'mission.md'), '# Consumer mission\n');

    const profiles = run(project, ['llm:profiles:init']);
    assert.equal(profiles.status, 0, profiles.stderr);
    assert.ok(fs.existsSync(path.join(project, '.context', 'llm-profiles.json')));
    assert.ok(!fs.existsSync(path.join(project, 'projects')));

    const synced = run(project, ['sync:universal']);
    assert.equal(synced.status, 0, `${synced.stdout}\n${synced.stderr}`);
    assert.ok(fs.existsSync(path.join(project, 'memory', 'sqlite', 'universal.db')));

    const audited = run(project, ['llm:recommend', '--role', 'worker', '--task', 'implementation']);
    assert.equal(audited.status, 0, audited.stderr);
    const runs = fs.readFileSync(path.join(project, '.context', 'forja-runs.jsonl'), 'utf8');
    assert.match(runs, /llm:recommend/);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('project catalog commands force studio mode even when called from a consumer project', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-studio-command-'));
  const studio = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-studio-root-'));
  try {
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'consumer-project', private: true }));
    const result = spawnSync(process.execPath, [bin, 'workspace:init'], { cwd: project, encoding: 'utf8', env: { ...process.env, FORJA_WORKSPACE: studio } });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(studio, 'projects')));
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(studio, { recursive: true, force: true });
  }
});
