import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cli = path.resolve(__dirname, '..', 'scripts', 'spec-cli.mjs');
const repoRoot = path.resolve(__dirname, '..');

function run(args, opts = {}) {
  return spawnSync('node', [cli, ...args], { encoding: 'utf8', cwd: repoRoot, ...opts });
}

test('spec:check sem features não falha quando dir vazio', () => {
  // este teste roda contra o repo real; tolera presença da meta-spec
  const r = run(['check']);
  assert.equal(r.status, 0, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('spec:plan falha quando spec em draft', () => {
  // a meta-spec está em "implementing", então plan deveria funcionar
  // mas criamos uma fresh
  const tmpName = `test-feature-${Date.now()}`;
  const created = run(['new', tmpName]);
  assert.equal(created.status, 0);
  try {
    const r = run(['plan', tmpName]);
    assert.notEqual(r.status, 0, 'plan deveria falhar em spec draft');
    assert.match(r.stderr, /status "draft"/);
  } finally {
    fs.rmSync(path.join(repoRoot, 'specs', tmpName), { recursive: true, force: true });
  }
});

test('spec:new cria estrutura', () => {
  const tmpName = `test-create-${Date.now()}`;
  try {
    const r = run(['new', tmpName]);
    assert.equal(r.status, 0);
    const specPath = path.join(repoRoot, 'specs', tmpName, 'spec.md');
    assert.ok(fs.existsSync(specPath), 'spec.md deveria existir');
    const content = fs.readFileSync(specPath, 'utf8');
    assert.match(content, new RegExp(`Spec: ${tmpName}`));
  } finally {
    fs.rmSync(path.join(repoRoot, 'specs', tmpName), { recursive: true, force: true });
  }
});

test('spec:new recusa duplicado', () => {
  const tmpName = `test-dup-${Date.now()}`;
  try {
    run(['new', tmpName]);
    const r = run(['new', tmpName]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /já existe/);
  } finally {
    fs.rmSync(path.join(repoRoot, 'specs', tmpName), { recursive: true, force: true });
  }
});
