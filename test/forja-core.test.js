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
const forja = path.join(root, 'bin/forja.ts');

function run(args, env = process.env) {
  return spawnSync(process.execPath, [forja, ...args], { cwd: root, encoding: 'utf8', env });
}

test('registry: todo comando node aponta para script existente', () => {
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    assert.ok(cmd.domain in DOMAINS, `${name}: domínio desconhecido (${cmd.domain})`);
    assert.ok(cmd.desc, `${name}: sem descrição`);
    assert.ok(cmd.node || cmd.bin || cmd.capability, `${name}: sem alvo de execução`);
    if (cmd.node) {
      assert.ok(fs.existsSync(path.join(root, cmd.node)), `${name}: script ausente (${cmd.node})`);
    }
  }
});

test('help --all: lista todos os domínios e sai com 0', () => {
  const res = run(['help', '--all']);
  assert.equal(res.status, 0);
  for (const label of Object.values(DOMAINS)) {
    assert.ok(res.stdout.includes(label), `help --all sem domínio: ${label}`);
  }
});

test('help (curto): só o núcleo + rodapé --all, exit 0', () => {
  const res = run([]);
  assert.equal(res.status, 0);
  const coreCount = Object.values(COMMANDS).filter((c) => c.tier === 'core').length;
  const allCount = Object.keys(COMMANDS).length;
  assert.match(res.stdout, /forja help --all/, 'rodapé --all ausente');
  assert.match(res.stdout, new RegExp(`${allCount - coreCount} comandos restantes`));
  // um comando avançado típico não aparece no help curto
  assert.ok(!res.stdout.includes('token:benchmark'), 'help curto vazou comando avançado');
});

test('help <cmd>: mostra uso, exemplo e próximos passos', () => {
  const res = run(['help', 'spec:new']);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Uso: forja spec:new <slug>/);
  assert.match(res.stdout, /Exemplos:/);
  assert.match(res.stdout, /Proximos passos:/);
});

test('help <cmd> inexistente: exit 1 com sugestão', () => {
  const res = run(['help', 'spec:nwe']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /spec:new/);
});

test('comando desconhecido: exit 1 com sugestão', () => {
  const res = run(['spec:nwe']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Comando desconhecido/);
  assert.match(res.stderr, /spec:new/);
  assert.match(res.stderr, /forja help /);
});

test('suggest fuzzy: `forja plan` sugere `spec:plan`', () => {
  const res = run(['plan']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /spec:plan/);
});

test('AC-5: arg posicional obrigatório em falta falha sem stack trace', () => {
  const res = run(['spec:new']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /argumento obrigatório/i);
  assert.match(res.stderr, /Uso: forja spec:new <slug>/);
  assert.ok(!/\bat \/.+:\d+:\d+/.test(res.stderr) && !res.stderr.includes('    at '), 'vazou stack trace do filho');
});

test('AC-8: comandos tier:core têm usage + exemplo válido', () => {
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    if (cmd.tier !== 'core') continue;
    assert.ok(cmd.usage && cmd.usage.trim().length > 0, `${name}: sem usage`);
    assert.ok(Array.isArray(cmd.examples) && cmd.examples.length >= 1, `${name}: sem examples`);
    for (const ex of cmd.examples) {
      assert.ok(ex.startsWith('forja '), `${name}: exemplo não começa com "forja ": ${ex}`);
      const cited = ex.split(/\s+/)[1];
      assert.ok(cited in COMMANDS, `${name}: exemplo cita comando inexistente (${cited})`);
    }
    for (const n of cmd.next ?? []) {
      assert.ok(n in COMMANDS, `${name}: next cita comando inexistente (${n})`);
    }
  }
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
