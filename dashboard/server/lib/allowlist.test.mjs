import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_ALLOWLIST, ALLOWED_NAMES, isAllowed, getCommand } from './allowlist.mjs';
import { runCommand, CommandNotAllowed } from './run-command.mjs';

test('allowlist contém comandos operacionais e fases GSD permitidas', () => {
  assert.deepEqual([...ALLOWED_NAMES].sort(), [
    'context:build',
    'design:check',
    'design:select',
    'gsd:check',
    'gsd:handoff',
    'gsd:plan',
    'memory:vacuum',
    'project:check',
    'spec:check',
    'sprint:status',
    'sync:universal',
  ]);
});

test('allowlist é frozen — não dá pra injetar comando em runtime', () => {
  const original = ALLOWED_NAMES.length;
  assert.throws(() => {
    COMMAND_ALLOWLIST['rm:rf'] = { cmd: 'rm', args: ['-rf', '/'] };
  });
  assert.equal(ALLOWED_NAMES.length, original);
});

test('isAllowed: true só para nomes literais', () => {
  assert.equal(isAllowed('spec:check'), true);
  assert.equal(isAllowed('SPEC:CHECK'), false, 'case-sensitive');
  assert.equal(isAllowed('spec:check ; rm -rf /'), false, 'sem prefixo');
  assert.equal(isAllowed('spec:'), false);
  assert.equal(isAllowed(''), false);
  assert.equal(isAllowed(undefined), false);
  // toda chave herdada (toString etc) NÃO é permitida
  assert.equal(isAllowed('toString'), false);
  assert.equal(isAllowed('constructor'), false);
  assert.equal(isAllowed('__proto__'), false);
});

test('getCommand devolve null para comando não-listado', () => {
  assert.equal(getCommand('eval'), null);
  assert.equal(getCommand('spec:check; ls'), null);
});

test('somente comandos parametrizados aceitam args validados', () => {
  const withArgs = ['context:build', 'design:check', 'design:select', 'gsd:check', 'gsd:handoff', 'gsd:plan'];
  for (const name of ALLOWED_NAMES) {
    assert.equal(COMMAND_ALLOWLIST[name].acceptsArgs, withArgs.includes(name), `${name} acceptsArgs inesperado`);
  }
});

test('runCommand: fora da allowlist lança CommandNotAllowed', () => {
  assert.throws(() => runCommand('rm:rf'), (err) => {
    assert.equal(err.name, 'CommandNotAllowed');
    assert.equal(err.code, 'COMMAND_NOT_ALLOWED');
    assert.equal(err.requested, 'rm:rf');
    assert.ok(Array.isArray(err.allowed));
    return true;
  });
});

test('runCommand: injeção via separador shell é rejeitada', () => {
  assert.throws(() => runCommand('spec:check; cat /etc/passwd'), CommandNotAllowed);
  assert.throws(() => runCommand('spec:check && ls'), CommandNotAllowed);
  assert.throws(() => runCommand('spec:check\nls'), CommandNotAllowed);
});

test('runCommand: spec:check roda e devolve stream', async () => {
  const { stdout, stderr, done, meta } = runCommand('spec:check');
  assert.equal(meta.name, 'spec:check');
  assert.equal(meta.cmd, 'node');
  assert.ok(meta.args.includes('check'));

  let out = '';
  stdout.on('data', (chunk) => { out += chunk; });
  let err = '';
  stderr.on('data', (chunk) => { err += chunk; });

  const result = await done;
  assert.ok(out.length > 0, `stdout vazio: stderr=${err}`);
  // spec:check imprime as features encontradas
  assert.match(out, /spec:/i);
  // Pode falhar com tasks:unknown — tolerar code 0 ou 1
  assert.ok([0, 1].includes(result.code), `exit code inesperado: ${result.code}`);
});

test('runCommand: AbortSignal interrompe execução', async () => {
  const ac = new AbortController();
  const { done } = runCommand('sync:universal', { signal: ac.signal });
  setTimeout(() => ac.abort(), 50);
  const result = await done;
  // Quando AbortController dispara, spawn emite AbortError + close com signal.
  // Aceita: aborted=true OR exit por signal OR code!=0.
  assert.ok(result.aborted || result.signal || result.code !== 0,
    `esperava abort/signal/exit≠0, recebi ${JSON.stringify(result)}`);
});
