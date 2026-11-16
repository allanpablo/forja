import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveCommand, quoteCmdArg, spawnAgent, runShell, killTree } from '../lib/exec.ts';

const IS_WIN = process.platform === 'win32';

// SPEC-059 AC-1: resolveCommand encontra binários por plataforma
test('SPEC-059 AC-1: resolveCommand encontra node (binário existente)', () => {
  const resolved = resolveCommand('node');
  assert.ok(resolved, 'node deve ser encontrável');
  assert.ok(path.isAbsolute(resolved), `caminho deve ser absoluto: ${resolved}`);
});

test('SPEC-059 AC-1: resolveCommand retorna null para binário inexistente', () => {
  assert.equal(resolveCommand('forja-binario-que-nao-existe-xyz'), null);
});

test('SPEC-059 AC-1: resolveCommand aceita caminho absoluto sem consultar PATH', () => {
  const abs = process.execPath;
  assert.equal(resolveCommand(abs), abs);
});

// SPEC-059 AC-2: quoting de cmd.exe com argumentos hostis
// A tabela prova que cada caractere perigoso chega ao filho byte a byte e nenhum
// executa um segundo comando. Em POSIX o quoting não é usado (spawn direto), então
// os testes de roundtrip via cmd.exe são condicionais.
const HOSTILE_ARGS = [
  ['aspas duplas', 'hello "world"'],
  ['e comercial', 'a&b'],
  ['pipe', 'a|b'],
  ['redireciona saída', 'a>b'],
  ['redireciona entrada', 'a<b'],
  ['variável inexistente', '%FORJA_TEST_VAR_INEXISTENTE%'],
  ['circunflexo', 'a^b'],
  ['espaço', 'hello world'],
  ['barra invertida', 'C:\\path\\to\\file'],
  ['barra invertida antes de aspas', 'path\\"quoted"'],
  ['parênteses', '(a&b)'],
  ['exclamação', 'a!b'],
  ['vazio', ''],
  ['múltiplos perigosos', 'a & b | c > d < e ^ f % g'],
];

for (const [name, arg] of HOSTILE_ARGS) {
  test(`SPEC-059 AC-2: quoteCmdArg não quebra com ${name}`, () => {
    const quoted = quoteCmdArg(arg);
    assert.ok(typeof quoted === 'string');
    // O quoting deve produzir algo não-vazio (exceto arg vazio → "")
    if (arg.length > 0) assert.ok(quoted.length > 0);
  });
}

test('SPEC-059 AC-2: roundtrip via cmd.exe — argumentos hostis chegam byte a byte', { skip: !IS_WIN && 'requer cmd.exe' }, () => {
  // Cria um .cmd que ecoa cada argumento em uma linha separada via node
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-exec-test-'));
  try {
    const echoScript = path.join(dir, 'echo.mjs');
    fs.writeFileSync(echoScript, 'process.argv.slice(2).forEach(a => console.log(JSON.stringify(a)));\n');
    const shim = path.join(dir, 'echo.cmd');
    fs.writeFileSync(shim, `@echo off\r\n"${process.execPath}" "${echoScript}" %*\r\n`);

    for (const [, arg] of HOSTILE_ARGS) {
      if (arg.length === 0) continue; // cmd.exe não passa arg vazio via %*
      const r = spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${shim}" ${quoteCmdArg(arg)}`], {
        encoding: 'utf8',
        timeout: 10_000,
        windowsVerbatimArguments: true,
      });
      assert.equal(r.status, 0, `shim falhou para ${JSON.stringify(arg)}: ${r.stderr}`);
      const received = JSON.parse(r.stdout.trim());
      assert.equal(received, arg, `roundtrip falhou para ${JSON.stringify(arg)}: recebeu ${JSON.stringify(received)}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SPEC-059 AC-2: roundtrip POSIX — spawn direto preserva argumentos', { skip: IS_WIN && 'teste POSIX' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-exec-test-'));
  try {
    const echoScript = path.join(dir, 'echo.mjs');
    fs.writeFileSync(echoScript, 'process.argv.slice(2).forEach(a => console.log(JSON.stringify(a)));\n');
    const shim = path.join(dir, 'echo');
    fs.writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${echoScript}" "$@"\n`);
    fs.chmodSync(shim, 0o755);

    for (const [, arg] of HOSTILE_ARGS) {
      const child = spawnAgent(shim, [arg], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      const code = await new Promise((resolve) => child.on('close', resolve));
      assert.equal(code, 0);
      const received = JSON.parse(out.trim());
      assert.equal(received, arg, `roundtrip falhou para ${JSON.stringify(arg)}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// SPEC-059 AC-6: runShell portável
test('SPEC-059 AC-6: runShell executa echo nos dois SOs', () => {
  const r = runShell('echo forja-exec-ok');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /forja-exec-ok/);
});

test('SPEC-059 AC-6: runShell reporta exit code de comando falho', () => {
  const r = runShell(IS_WIN ? 'exit /b 42' : 'exit 42');
  assert.equal(r.status, 42);
});

// SPEC-059 AC-4: killTree derruba filho e netos
test('SPEC-059 AC-4: killTree encerra árvore de dois níveis', { timeout: 15_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-exec-kill-'));
  try {
    // Neto: escreve a cada 50ms num arquivo. Filho: spawna o neto e espera.
    const marker = path.join(dir, 'alive.txt');
    const grandchild = path.join(dir, 'grandchild.cjs');
    fs.writeFileSync(grandchild, `
      const fs = require('node:fs');
      const interval = setInterval(() => fs.appendFileSync(${JSON.stringify(marker)}, 'x'), 50);
      process.on('SIGTERM', () => { clearInterval(interval); process.exit(0); });
      setTimeout(() => {}, 60_000);
    `);
    const parent = path.join(dir, 'parent.cjs');
    fs.writeFileSync(parent, `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, [${JSON.stringify(grandchild)}], { stdio: 'ignore' });
      child.on('exit', () => process.exit(0));
      setTimeout(() => {}, 60_000);
    `);

    const child = spawnAgent(process.execPath, [parent], { stdio: 'ignore', detached: !IS_WIN });
    assert.ok(child.pid, 'processo deve ter pid');

    // Espera o neto começar a escrever
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.ok(fs.existsSync(marker), 'neto deveria ter criado o marcador');
    const sizeBefore = fs.statSync(marker).size;
    assert.ok(sizeBefore > 0, 'neto deveria estar escrevendo');

    killTree(child.pid, 500);

    // Espera o grace + margem
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const sizeAfter = fs.existsSync(marker) ? fs.statSync(marker).size : 0;
    // O neto deve ter parado de escrever (tamanho estabilizou)
    await new Promise((resolve) => setTimeout(resolve, 500));
    const sizeFinal = fs.existsSync(marker) ? fs.statSync(marker).size : 0;
    assert.equal(sizeFinal, sizeAfter, 'neto não deveria continuar escrevendo após killTree');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// SPEC-059 AC-1: spawnAgent com stub portável
test('SPEC-059 AC-1/AC-3: spawnAgent executa stub e captura argv', { timeout: 10_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-exec-stub-'));
  try {
    const capture = path.join(dir, 'argv.json');
    const script = path.join(dir, 'agent.cjs');
    fs.writeFileSync(script, `
      const fs = require('node:fs');
      fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2)));
      console.log('stub-ok');
    `);

    let executable;
    if (IS_WIN) {
      executable = path.join(dir, 'agent.cmd');
      fs.writeFileSync(executable, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
    } else {
      executable = path.join(dir, 'agent');
      fs.writeFileSync(executable, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
      fs.chmodSync(executable, 0o755);
    }

    const child = spawnAgent(executable, ['--flag', 'hello world', 'a&b'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const code = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(code, 0, `stub falhou: ${out}`);
    assert.match(out, /stub-ok/);
    const argv = JSON.parse(fs.readFileSync(capture, 'utf8'));
    assert.deepEqual(argv, ['--flag', 'hello world', 'a&b']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});