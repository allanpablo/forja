import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMANDS } from '../lib/core/registry.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const forja = path.join(root, 'bin/forja.ts');

// Comandos json:true pesados demais para rodar por inteiro no unit test (worktree isolado,
// indexação de grafo). Deles verificamos só o caminho de erro do contrato — que é rápido.
const HEAVY = new Set(['simulate', 'engineer']);

// Args mínimos válidos por comando, quando precisam de um posicional.
const MIN_ARGS = { simulate: ['HEAD'], engineer: ['"probe"'] };

function run(args, env) {
  return spawnSync(process.execPath, [forja, ...args], { cwd: root, encoding: 'utf8', env });
}

function parseOne(stdout) {
  const trimmed = stdout.trim();
  assert.ok(trimmed.length > 0, 'stdout vazio');
  const parsed = JSON.parse(trimmed); // lança se não for um único JSON válido
  assert.equal(typeof parsed, 'object');
  assert.ok(parsed !== null && !Array.isArray(parsed), 'stdout não é um objeto JSON');
  return parsed;
}

const jsonCommands = Object.entries(COMMANDS).filter(([, c]) => c.json === true);

test('há comandos json:true no registry', () => {
  assert.ok(jsonCommands.length >= 4, `esperava ≥4, achei ${jsonCommands.length}`);
});

for (const [name, cmd] of jsonCommands) {
  test(`contrato: ${name} --json`, (t) => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-contract-'));
    const env = { ...process.env, FORJA_WORKSPACE: ws };
    try {
      if (HEAVY.has(name)) {
        // só o caminho de erro: sem o arg obrigatório → {status:'error'} + exit 1
        const r = run([name, '--json'], env);
        assert.equal(r.status, 1, `${name}: exit ${r.status} (stderr: ${r.stderr.slice(0, 200)})`);
        const d = parseOne(r.stdout);
        assert.equal(d.status, 'error');
        assert.ok(d.error && typeof d.error.message === 'string');
        return;
      }

      const args = [name, ...(MIN_ARGS[name] ?? []), '--json'];
      const r = run(args, env);
      const d = parseOne(r.stdout);
      assert.ok(['ok', 'error', 'rejected'].includes(d.status), `${name}: status inválido (${d.status})`);
      const expected = { ok: 0, error: 1, rejected: 2 }[d.status];
      assert.equal(r.status, expected, `${name}: status ${d.status} mas exit ${r.status}`);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
}

test('contrato: arg obrigatório em falta com --json → {status:"error"}, exit 1', () => {
  const r = run(['simulate', '--json'], process.env);
  assert.equal(r.status, 1);
  const d = parseOne(r.stdout);
  assert.equal(d.status, 'error');
  assert.equal(d.error.code, 'MISSING_ARG');
});
