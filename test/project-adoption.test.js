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

test('project:upgrade --all: dry-run não toca nada; --apply religa cada projeto Forja do workspace', { timeout: 180_000 }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-upall-'));
  const ws = path.join(base, 'ws');
  const env = { ...process.env, HOME: base, FORJA_WORKSPACE: ws };
  for (const k of Object.keys(env)) if (k.startsWith('npm_')) delete env[k];
  const run = (cwd, ...args) => spawnSync(process.execPath, [bin, ...args], { cwd, env, encoding: 'utf8' });
  try {
    fs.mkdirSync(path.join(ws, 'projects', 'antigo'), { recursive: true });
    fs.mkdirSync(path.join(ws, 'projects', 'alheio'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects', 'antigo', 'AGENTS.md'), '# AGENTS\n\nnotas do time\n');
    assert.equal(run(base, 'workspace:init').status, 0);

    const dry = run(base, 'project:upgrade', '--all', '--json');
    assert.equal(dry.status, 0, dry.stderr);
    const byName = Object.fromEntries(JSON.parse(dry.stdout).map((r) => [r.name, r.status]));
    assert.deepEqual(byName, { alheio: 'nao-forja', antigo: 'pendente' });
    assert.ok(!fs.existsSync(path.join(ws, 'projects', 'antigo', '.mcp.json')), 'dry-run não escreve');

    const applied = run(base, 'project:upgrade', '--all', '--apply');
    assert.equal(applied.status, 0, applied.stderr);
    const agents = fs.readFileSync(path.join(ws, 'projects', 'antigo', 'AGENTS.md'), 'utf8');
    assert.match(agents, /forja:begin/);
    assert.match(agents, /notas do time/, 'conteúdo do usuário preservado');
    assert.equal(run(path.join(ws, 'projects', 'antigo'), 'project:wire', '--check').status, 0);
    assert.ok(!fs.existsSync(path.join(ws, 'projects', 'alheio', 'AGENTS.md')), 'projeto alheio intocado');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('project:upgrade nunca toca o backend do usuário nem traz domínios de exemplo', { timeout: 120_000 }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-upcode-'));
  const repo = path.join(base, 'app');
  fs.mkdirSync(path.join(repo, 'backend'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'memory', '30-domains', 'telemetria'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'backend', 'main.py'), 'print("api")\n');           // backend Python
  fs.writeFileSync(path.join(repo, 'memory', '30-domains', 'telemetria', 'context.md'), '# Telemetria\n');
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), '# AGENTS\n');
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'app' }));
  const env = { ...process.env, HOME: base };
  for (const k of Object.keys(env)) if (k.startsWith('FORJA_') || k.startsWith('npm_')) delete env[k];
  try {
    const up = spawnSync(process.execPath, [bin, 'project:upgrade', '--apply'], { cwd: repo, env, encoding: 'utf8' });
    assert.equal(up.status, 0, up.stderr);
    assert.deepEqual(fs.readdirSync(path.join(repo, 'backend')), ['main.py'], 'backend do usuário intocado');
    assert.deepEqual(fs.readdirSync(path.join(repo, 'memory', '30-domains')).filter((d) => d !== 'shared'), ['telemetria'], 'sem auth/billing de exemplo');
    assert.ok(!fs.existsSync(path.join(repo, 'agents', 'backend-nest.md')), 'sem agente NestJS num projeto que não é Nest');
    assert.ok(fs.existsSync(path.join(repo, 'memory', '00-global', 'mission.md')), 'a camada do Forja chega');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
