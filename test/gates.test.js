import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runGates, overallStatus } from '../lib/core/gates.ts';

/** Fakes: runners que devolvem status conhecidos — testa a composição sem gerar projeto/tarball. */
const r = (id, status, severity = 'critical') => ({ id, status, severity, detail: id, fix: null });

test('runGates (barato) roda coerência + projeto gerado, não o tarball', async () => {
  const groups = await runGates({
    deps: {
      health: async () => [r('adr-refs', 'ok')],
      smoke: async () => [r('generated', 'ok')],
      release: async () => [r('install', 'ok')],
    },
  });
  assert.deepEqual(groups.map((g) => g.name), ['núcleo & coerência', 'projeto gerado']);
});

test('runGates --full adiciona o grupo do tarball', async () => {
  const groups = await runGates({
    full: true,
    deps: {
      health: async () => [r('adr-refs', 'ok')],
      smoke: async () => [r('generated', 'ok')],
      release: async () => [r('install', 'ok')],
    },
  });
  assert.deepEqual(groups.map((g) => g.name), ['núcleo & coerência', 'projeto gerado', 'tarball (instalação limpa)']);
});

test('overallStatus é o pior status entre todos os gates', async () => {
  const groups = await runGates({
    deps: {
      health: async () => [r('a', 'ok'), r('b', 'warn')],
      smoke: async () => [r('c', 'fail')],
    },
  });
  assert.equal(overallStatus(groups), 'fail', 'um fail em qualquer grupo → veredito fail');
});

test('tudo ok → veredito ok', async () => {
  const groups = await runGates({
    deps: { health: async () => [r('a', 'ok')], smoke: async () => [r('b', 'ok')] },
  });
  assert.equal(overallStatus(groups), 'ok');
});

test('warn sem fail → veredito warn (não escala)', async () => {
  const groups = await runGates({
    deps: { health: async () => [r('a', 'ok')], smoke: async () => [r('b', 'warn')] },
  });
  assert.equal(overallStatus(groups), 'warn');
});

test('o full é passado adiante para o smoke', async () => {
  let recebido = null;
  await runGates({
    full: true,
    deps: {
      health: async () => [],
      smoke: async ({ full }) => { recebido = full; return []; },
      release: async () => [],
    },
  });
  assert.equal(recebido, true, 'smoke recebe { full: true }');
});
