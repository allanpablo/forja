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

test('runGates não roda drift:check por padrão (SPEC-030 AC-5 é opt-in)', async () => {
  let driftChamado = false;
  const groups = await runGates({
    deps: {
      health: async () => [r('a', 'ok')],
      smoke: async () => [r('b', 'ok')],
      drift: async () => { driftChamado = true; return [r('drift-check', 'warn', 'warn')]; },
    },
  });
  assert.equal(driftChamado, false);
  assert.ok(!groups.some((g) => g.name.includes('drift')));
});

test('runGates --with-drift adiciona o grupo do drift sentinel sem escalar o veredito para fail', async () => {
  const groups = await runGates({
    withDrift: true,
    deps: {
      health: async () => [r('a', 'ok')],
      smoke: async () => [r('b', 'ok')],
      drift: async () => [r('drift-check', 'warn', 'warn')],
    },
  });
  assert.ok(groups.some((g) => g.name.includes('drift')));
  assert.equal(overallStatus(groups), 'warn', 'drift é severity warn — nunca reprova check:all sozinho');
});

test('runGates não roda architecture:check por padrão (SPEC-033 AC-7 é opt-in)', async () => {
  let architectureChamado = false;
  const groups = await runGates({
    deps: {
      health: async () => [r('a', 'ok')],
      smoke: async () => [r('b', 'ok')],
      architecture: async () => { architectureChamado = true; return [r('architecture-check', 'ok')]; },
    },
  });
  assert.equal(architectureChamado, false);
  assert.ok(!groups.some((g) => g.name.includes('architecture')));
});

test('runGates --with-architecture adiciona o grupo e ESCALA o veredito para fail numa violação (diferente de drift)', async () => {
  const groups = await runGates({
    withArchitecture: true,
    deps: {
      health: async () => [r('a', 'ok')],
      smoke: async () => [r('b', 'ok')],
      architecture: async () => [r('architecture-check', 'fail', 'critical')],
    },
  });
  assert.ok(groups.some((g) => g.name.includes('architecture')));
  assert.equal(overallStatus(groups), 'fail', 'uma regra active violada é reprovação real, não só sinal — ao contrário de drift');
});
