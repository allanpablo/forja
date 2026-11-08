import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilityIdFromExecutePath, isCapabilityListPath, isReadOnlyCapability } from '../apps/dashboard/app/api/forja/capabilities.ts';
import { CLI_CAPABILITY_SPECS } from '../apps/cli/src/index.ts';

test('isReadOnlyCapability libera leitura sem efeito colateral e bloqueia o resto', () => {
  assert.equal(isReadOnlyCapability({ id: 'forja.status', permissions: ['read'], sideEffects: [] }), true);
  assert.equal(isReadOnlyCapability({ id: 'spec.create', permissions: ['write'], sideEffects: ['spec_file'] }), false);
  // risk low não é read-only: `context:budget` grava um registro de run a cada chamada.
  assert.equal(isReadOnlyCapability({ id: 'context.budget', permissions: ['read'], sideEffects: ['context_run_record'] }), false);
  assert.equal(isReadOnlyCapability({ id: 'drift.check', permissions: ['read'], sideEffects: ['graph_write'] }), false);
});

test('isReadOnlyCapability falha fechado quando a definição não declara o que toca', () => {
  assert.equal(isReadOnlyCapability(null), false);
  assert.equal(isReadOnlyCapability({ id: 'x' }), false, 'sem permissions/sideEffects não há como saber');
  assert.equal(isReadOnlyCapability({ id: 'x', permissions: 'read', sideEffects: [] }), false, 'campo com tipo errado não vira liberação');
});

test('capabilityIdFromExecutePath só aceita a forma exata da rota de execução', () => {
  assert.equal(capabilityIdFromExecutePath('/capabilities/spec.validate/execute'), 'spec.validate');
  assert.equal(capabilityIdFromExecutePath('/capabilities/forja.status/execute'), 'forja.status');
  assert.equal(capabilityIdFromExecutePath('/capabilities//execute'), null);
  assert.equal(capabilityIdFromExecutePath('/capabilities/a/b/execute'), null, 'id com barra escaparia para outra rota');
  assert.equal(capabilityIdFromExecutePath('/capabilities/spec.validate'), null);
  assert.equal(capabilityIdFromExecutePath('/capabilitiesX/spec.validate/execute'), null);
  assert.equal(isCapabilityListPath('/capabilities'), true);
  assert.equal(isCapabilityListPath('/capabilities/'), false);
});

// ADR-0022, condição de retomada #2: a superfície que o painel alcança é derivada das declarações,
// e este teste é o lugar onde uma mudança nela aparece de propósito. Não é allowlist escrita à mão —
// é o retrato do que a regra acima produz a partir de CLI_CAPABILITY_SPECS hoje.
test('o painel alcança exatamente as capacidades de leitura declaradas, e nenhuma que escreve', () => {
  const alcancaveis = CLI_CAPABILITY_SPECS
    .filter((spec) => isReadOnlyCapability({ id: spec.id, permissions: spec.permissions, sideEffects: spec.sideEffects }))
    .map((spec) => spec.id)
    .sort();
  assert.deepEqual(alcancaveis, [
    'code.context',
    'code.impact',
    'cost.economy',
    'engineering.facade',
    'forja.next',
    'forja.status',
    'memory.query',
    'orchestrate.status',
    'spec.trace',
    'spec.validate',
    'sprint.status',
    'system.doctor',
  ]);
  for (const spec of CLI_CAPABILITY_SPECS) {
    if (spec.categories.includes('write')) {
      assert.equal(isReadOnlyCapability({ id: spec.id, permissions: spec.permissions, sideEffects: spec.sideEffects }), false, `${spec.id} declara write e não pode ser alcançável pela UI`);
    }
  }
});
