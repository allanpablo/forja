import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findPkgRoot, resolveScript, pkgRoot, codeRoot } from '../lib/paths.ts';

/**
 * ADR-0086 — raiz de código × raiz de assets. A classe de bug "funciona no repo, quebra instalado"
 * voltou três vezes (v1.6.1, v1.7.0, v4.x) porque cada script calculava a própria raiz. Estes testes
 * vigiam a classe inteira, não um arquivo.
 */

const SOURCE_DIRS = ['bin', 'lib', 'scripts', 'apps', 'packages'];
// Exceções legítimas: o próprio resolvedor e os templates de scripts emitidos para projetos gerados
// (strings que viram arquivos do projeto, onde `__dirname/..` é a raiz do projeto).
const ALLOW = new Set(['lib/paths.ts', 'lib/generators/memory-generator.ts']);

function sources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|mts)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
    }
  };
  for (const d of SOURCE_DIRS) if (fs.existsSync(d)) walk(d);
  return out.filter((f) => !ALLOW.has(f.split(path.sep).join('/')));
}

test('nenhum fonte calcula a raiz do pacote a partir de __dirname (use lib/paths.ts)', () => {
  const re = /(?:__dirname|dirname\(__filename\))\s*,\s*['"]\.\.['"]/;
  const offenders = sources().filter((f) => {
    // apps/server tem raiz de servidor própria (código, resolvida para o dist corretamente).
    if (f.startsWith(path.join('apps', 'server'))) return false;
    return re.test(fs.readFileSync(f, 'utf8'));
  });
  assert.deepEqual(offenders, [], 'calcule a raiz com pkgRoot/codeRoot de lib/paths.ts');
});

test('nenhum spawn crava extensão de script do Forja (use script()/resolveScript)', () => {
  const re = /path\.join\([^)]*['"](?:bin|scripts)\/[\w./-]+\.(?:js|mjs|ts)['"]/;
  const offenders = sources().filter((f) => re.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('dev: pkgRoot e codeRoot são a raiz do repo', () => {
  assert.equal(pkgRoot, process.cwd());
  assert.equal(codeRoot, process.cwd());
});

test('publicado: findPkgRoot sobe de dist/ até o package.json do forjajs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-paths-'));
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'forjajs' }));
    fs.mkdirSync(path.join(tmp, 'dist', 'lib'), { recursive: true });
    assert.equal(findPkgRoot(path.join(tmp, 'dist')), tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('findPkgRoot ignora package.json de outro pacote no caminho', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-paths-'));
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'forjajs' }));
    const nested = path.join(tmp, 'node_modules', 'outro');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'package.json'), JSON.stringify({ name: 'outro' }));
    assert.equal(findPkgRoot(nested), tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveScript acha .ts em dev e .js no dist, sem extensão no pedido', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-paths-'));
  try {
    fs.mkdirSync(path.join(tmp, 'bin'));
    fs.writeFileSync(path.join(tmp, 'bin', 'x.js'), '');
    assert.equal(resolveScript(tmp, 'bin/x'), path.join(tmp, 'bin', 'x.js'));
    assert.equal(resolveScript(tmp, 'bin/x.ts'), path.join(tmp, 'bin', 'x.js'));
    assert.equal(resolveScript(process.cwd(), 'bin/forja'), path.join(process.cwd(), 'bin', 'forja.ts'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
