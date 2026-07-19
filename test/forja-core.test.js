import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, DOMAINS } from '../lib/core/registry.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const forja = path.join(root, 'bin/forja.mjs');

function run(args, env = process.env) {
  return spawnSync(process.execPath, [forja, ...args], { cwd: root, encoding: 'utf8', env });
}

test('registry: todo comando node aponta para script existente', () => {
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    assert.ok(cmd.domain in DOMAINS, `${name}: domínio desconhecido (${cmd.domain})`);
    assert.ok(cmd.desc, `${name}: sem descrição`);
    assert.ok(cmd.node || cmd.bin, `${name}: sem alvo de execução`);
    if (cmd.node) {
      assert.ok(fs.existsSync(path.join(root, cmd.node)), `${name}: script ausente (${cmd.node})`);
    }
  }
});

test('help: sem args lista domínios e sai com 0', () => {
  const res = run([]);
  assert.equal(res.status, 0);
  for (const label of Object.values(DOMAINS)) {
    assert.ok(res.stdout.includes(label), `help sem domínio: ${label}`);
  }
});

test('comando desconhecido: exit 1 com sugestão', () => {
  const res = run(['spec:nwe']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Comando desconhecido/);
  assert.match(res.stderr, /spec:new/);
});

test('gate workspace: project:new bloqueia sem workspace', () => {
  const missing = path.join(os.tmpdir(), `forja-ws-inexistente-${Date.now()}`);
  const res = run(['project:new', 'teste-gate'], { ...process.env, FORJA_WORKSPACE: missing });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Gate reprovado/);
  assert.match(res.stderr, /workspace:init/);
});

test('auditoria: execução grava linha em forja-runs.jsonl do workspace', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-ws-'));
  try {
    const res = run(['project:list'], { ...process.env, FORJA_WORKSPACE: ws });
    assert.equal(res.status, 0);
    const log = path.join(ws, '.context', 'forja-runs.jsonl');
    assert.ok(fs.existsSync(log), 'forja-runs.jsonl não criado');
    const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines.at(-1));
    assert.equal(entry.cmd, 'project:list');
    assert.equal(entry.exitCode, 0);
    assert.ok(typeof entry.durationMs === 'number');
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});
