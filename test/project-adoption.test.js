import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// ADR-0086: adotar o Forja num repositório que já existe (modo embedded) — project:wire liga a IA,
// project:upgrade --apply traz a memória. Nada de backend intruso, nada de índice no git.
const bin = path.resolve('bin/forja.ts');

test('adoção: repo existente fica conectado, sem backend novo e com o índice fora do git', { timeout: 120_000 }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-adopt-'));
  const repo = path.join(base, 'app');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0', scripts: { test: 'node --test' } }));
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
  const env = { ...process.env, HOME: base };
  for (const k of Object.keys(env)) if (k.startsWith('FORJA_') || k.startsWith('npm_')) delete env[k];
  const forja = (...args) => spawnSync(process.execPath, [bin, ...args], { cwd: repo, env, encoding: 'utf8' });
  try {
    assert.equal(forja('project:wire', '--ai', 'claude,codex').status, 0);
    const up = forja('project:upgrade', '--apply');
    assert.equal(up.status, 0, up.stderr);
    assert.equal(forja('sync:universal').status, 0);

    assert.ok(!fs.existsSync(path.join(repo, 'backend')), 'upgrade não pode instalar backend num projeto que não tinha');
    assert.ok(fs.existsSync(path.join(repo, 'memory', '00-global', 'mission.md')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).scripts.test, 'node --test', 'scripts do usuário preservados');
    assert.match(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^memory\/sqlite\/$/m);

    const check = forja('project:wire', '--check', '--json');
    const report = JSON.parse(check.stdout);
    assert.equal(report.ok, true, JSON.stringify(report.checks.filter((c) => c.status !== 'ok')));
    assert.equal(forja('project:wire').stdout.trim(), '✓ projeto já estava conectado', 'wire é idempotente');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
