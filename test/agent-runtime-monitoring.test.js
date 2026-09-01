import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectAnomaly } from '../packages/engineering/monitoring/src/index.ts';

const now = '2026-09-01T00:00:00.000Z';

function report(metrics, observationIds = ['obs-1', 'obs-2', 'obs-3', 'obs-4', 'obs-5']) {
  return {
    schemaVersion: '2.0', id: 'report-1', createdAt: now, updatedAt: now, correlationId: 'c',
    scope: 'agent', scopeId: 'agent-1', observationIds, metrics: { observationCount: observationIds.length, ...metrics },
    findings: [],
  };
}

test('detectAnomaly: comportamento estável (mesmas taxas) não sinaliza nada', () => {
  const baseline = report({ successRate: 0.9, reworkRate: 0.05, rollbackRate: 0 });
  const recent = report({ successRate: 0.9, reworkRate: 0.05, rollbackRate: 0 });
  const assessment = detectAnomaly('agent-1', baseline, recent);
  assert.equal(assessment.score, 0);
});

test('detectAnomaly: degradação clara (successRate 90% → 30%) sinaliza forte, com o delta correto', () => {
  const baseline = report({ successRate: 0.9, reworkRate: 0.05, rollbackRate: 0 });
  const recent = report({ successRate: 0.3, reworkRate: 0.05, rollbackRate: 0 });
  const assessment = detectAnomaly('agent-1', baseline, recent);
  assert.ok(assessment.score > 0, 'queda de successRate deve gerar score > 0');
  const successSignal = assessment.signals.find((s) => s.metric === 'successRate');
  assert.equal(successSignal.baseline, 0.9);
  assert.equal(successSignal.recent, 0.3);
  assert.ok(Math.abs(successSignal.delta - -0.6) < 1e-9);
});

test('detectAnomaly: successRate subindo ou rework/rollback caindo nunca aumentam o score (só a direção ruim conta)', () => {
  const baseline = report({ successRate: 0.5, reworkRate: 0.5, rollbackRate: 0.5 });
  const recent = report({ successRate: 0.9, reworkRate: 0.1, rollbackRate: 0.1 }); // tudo melhorou
  const assessment = detectAnomaly('agent-1', baseline, recent);
  assert.equal(assessment.score, 0, 'melhora em todas as métricas não deveria soar alarme');
});

test('detectAnomaly: amostra pequena em qualquer um dos dois recortes reduz confidence (AC-2)', () => {
  const baseline = report({ successRate: 0.9, reworkRate: 0, rollbackRate: 0 }, ['obs-1', 'obs-2']);
  const recent = report({ successRate: 0.1, reworkRate: 0, rollbackRate: 0 });
  const assessment = detectAnomaly('agent-1', baseline, recent);
  assert.ok(assessment.confidence < 1, 'baseline com só 2 observations deve reduzir confidence mesmo com recent tendo 5');
  assert.equal(assessment.confidence, 2 / 5);
});

test('detectAnomaly: score satura em 100 mesmo com desvio extremo em todas as métricas', () => {
  const baseline = report({ successRate: 1, reworkRate: 0, rollbackRate: 0 });
  const recent = report({ successRate: 0, reworkRate: 1, rollbackRate: 1 });
  const assessment = detectAnomaly('agent-1', baseline, recent);
  assert.equal(assessment.score, 100);
});

test('detectAnomaly: thresholds.minSampleSize customizado é respeitado', () => {
  const baseline = report({ successRate: 0.9, reworkRate: 0, rollbackRate: 0 }, ['obs-1']);
  const recent = report({ successRate: 0.1, reworkRate: 0, rollbackRate: 0 }, ['obs-1']);
  const assessment = detectAnomaly('agent-1', baseline, recent, { minSampleSize: 1 });
  assert.equal(assessment.confidence, 1);
});
