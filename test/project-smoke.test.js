import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runChecks } from '../lib/core/checks.ts';
import { SMOKE_CHECKS, defaultEnv } from '../lib/core/project-smoke.ts';

/** Um projeto de fixture no disco, sem rodar o gerador real. */
function fixtureProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-smoke-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

const only = (id) => SMOKE_CHECKS.filter((c) => c.id === id);

test('no-placeholders reprova quando um template {{...}} vaza (AC-2)', async () => {
  const projectDir = fixtureProject({
    'AGENTS.md': '# Projeto {{FEATURE}}\n', // placeholder vazado
  });
  const [r] = await runChecks({ checks: only('no-placeholders'), env: { ...defaultEnv(), projectDir } });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /\{\{FEATURE\}\}/);
  fs.rmSync(projectDir, { recursive: true, force: true });
});

test('no-placeholders passa quando tudo foi substituído', async () => {
  const projectDir = fixtureProject({
    'AGENTS.md': '# Projeto meu-app\n',
    'README.md': 'Sem chaves duplas aqui.\n',
  });
  const [r] = await runChecks({ checks: only('no-placeholders'), env: { ...defaultEnv(), projectDir } });
  assert.equal(r.status, 'ok');
  fs.rmSync(projectDir, { recursive: true, force: true });
});

test('no-placeholders ignora node_modules', async () => {
  const projectDir = fixtureProject({
    'AGENTS.md': 'ok\n',
    'node_modules/lib/x.js': 'const t = `{{NAO_E_NOSSO}}`;\n', // não é competência do gate
  });
  const [r] = await runChecks({ checks: only('no-placeholders'), env: { ...defaultEnv(), projectDir } });
  assert.equal(r.status, 'ok');
  fs.rmSync(projectDir, { recursive: true, force: true });
});

test('json-valid reprova package.json quebrado (AC-3)', async () => {
  const projectDir = fixtureProject({
    'backend/package.json': '{ "name": "x", }', // vírgula sobrando = JSON inválido
  });
  const [r] = await runChecks({ checks: only('json-valid'), env: { ...defaultEnv(), projectDir } });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /package\.json/);
  fs.rmSync(projectDir, { recursive: true, force: true });
});

test('json-valid passa com package.json válido', async () => {
  const projectDir = fixtureProject({
    'package.json': '{ "name": "x", "version": "1.0.0" }',
  });
  const [r] = await runChecks({ checks: only('json-valid'), env: { ...defaultEnv(), projectDir } });
  assert.equal(r.status, 'ok');
  fs.rmSync(projectDir, { recursive: true, force: true });
});

test('generated reprova quando o gerador não produz o marcador (AC-1)', async () => {
  const projectDir = fixtureProject({ 'lixo.txt': 'nada de AGENTS.md' });
  const [r] = await runChecks({ checks: only('generated'), env: { ...defaultEnv(), projectDir } });
  assert.equal(r.status, 'fail');
  fs.rmSync(projectDir, { recursive: true, force: true });
});

test('builds é skipped sem --full (AC-5 — tier caro é opt-in)', async () => {
  const projectDir = fixtureProject({ 'AGENTS.md': 'ok', 'backend/package.json': '{}' });
  const [r] = await runChecks({ checks: only('builds'), env: { ...defaultEnv({ full: false }), projectDir } });
  assert.equal(r.status, 'skipped');
  fs.rmSync(projectDir, { recursive: true, force: true });
});
