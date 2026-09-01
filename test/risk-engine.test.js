import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assessRisk,
  createRiskEngine,
  DEFAULT_AUTONOMY_BAND_THRESHOLDS,
  DEFAULT_RISK_WEIGHTS,
  explainAssessment,
} from '../packages/engineering/risk/src/index.ts';

const now = '2026-09-01T00:00:00.000Z';

/** RiskInput mínimo: tudo zerado/ausente — o caso de menor risco e menor confidence possível. */
function baseInput(overrides = {}) {
  return {
    blastRadiusCount: 0,
    blastRadiusEvidenceIds: [],
    architectureViolationCount: 0,
    architectureViolationEvidenceIds: [],
    sensitiveCategoriesTouched: [],
    sensitiveCategoryEvidenceIds: [],
    historicalFailureRate: undefined,
    historicalEvidenceIds: [],
    testedPathsRatio: undefined,
    testEvidenceIds: [],
    touchesSchemaOrMigration: false,
    reversibilityEvidenceIds: [],
    affectedServiceCount: 0,
    totalServiceCount: 4,
    deploymentEvidenceIds: [],
    ...overrides,
  };
}

test('assessRisk: input zerado produz score baixo, mas não zero (test_confidence neutro sem dado)', () => {
  const assessment = assessRisk(baseInput(), { id: 'a1', changeId: 'c1', now });
  // único fator não-zero é test_confidence (0.5 * peso 0.10 = 0.05 → 5), sem dado real.
  assert.equal(assessment.score, 5);
  assert.equal(assessment.autonomyBand, 'autonomous');
});

test('assessRisk: pesos somam 1.0 no default', () => {
  const sum = Object.values(DEFAULT_RISK_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `pesos default devem somar 1.0, somaram ${sum}`);
});

test('assessRisk: confidence é a fração de fatores com dado real (2 dos 7 sem dado → 5/7)', () => {
  const assessment = assessRisk(baseInput(), { id: 'a1', changeId: 'c1', now });
  // historical_failure_rate e test_confidence estão undefined em baseInput() → 5/7 têm dado real.
  assert.equal(assessment.confidence, Math.round((5 / 7) * 100) / 100);
});

test('assessRisk: fornecer histórico e cobertura de teste sobe a confidence para 1.0', () => {
  const assessment = assessRisk(baseInput({ historicalFailureRate: 0, testedPathsRatio: 1 }), { id: 'a1', changeId: 'c1', now });
  assert.equal(assessment.confidence, 1);
  const testFactor = assessment.factors.find((f) => f.name === 'test_confidence');
  assert.equal(testFactor.hasRealData, true);
  assert.equal(testFactor.value, 0, '100% coberto → valor do fator (inverso) é 0');
});

test('assessRisk: mudança de alto impacto em todos os fatores satura score perto de 100', () => {
  const input = baseInput({
    blastRadiusCount: 100,
    architectureViolationCount: 10,
    sensitiveCategoriesTouched: ['secrets', 'database', 'deployment'],
    historicalFailureRate: 1,
    testedPathsRatio: 0,
    touchesSchemaOrMigration: true,
    affectedServiceCount: 4,
  });
  const assessment = assessRisk(input, { id: 'a1', changeId: 'c1', now });
  assert.equal(assessment.score, 100);
  assert.equal(assessment.confidence, 1);
  assert.equal(assessment.autonomyBand, 'human_in_the_loop');
});

test('assessRisk: cada fator carrega os evidenceIds recebidos, nunca inventados', () => {
  const input = baseInput({ blastRadiusCount: 3, blastRadiusEvidenceIds: ['node-a', 'node-b', 'node-c'] });
  const assessment = assessRisk(input, { id: 'a1', changeId: 'c1', now });
  const blast = assessment.factors.find((f) => f.name === 'blast_radius');
  assert.deepEqual(blast.evidenceIds, ['node-a', 'node-b', 'node-c']);
  const security = assessment.factors.find((f) => f.name === 'security_sensitivity');
  assert.deepEqual(security.evidenceIds, []);
});

test('assessRisk: pesos customizados mudam o resultado', () => {
  const input = baseInput({ blastRadiusCount: 30 }); // blast_radius satura em 1.0
  const defaultScore = assessRisk(input, { id: 'a1', changeId: 'c1', now }).score;
  const heavyBlast = assessRisk(input, { id: 'a2', changeId: 'c1', now, weights: { blast_radius: 0.8 } }).score;
  assert.ok(heavyBlast > defaultScore, `peso maior em blast_radius (fator saturado) deve subir o score: ${heavyBlast} vs ${defaultScore}`);
});

test('assessRisk: bandas de autonomia respeitam os limites configurados (25/50/75)', () => {
  const band = (score) => {
    // historicalFailureRate entra direto (sem cap/divisão) como o valor do fator — score = round(100 * rate) exato.
    const input = baseInput({ historicalFailureRate: score / 100, testedPathsRatio: 1 });
    return assessRisk(input, { id: 'a1', changeId: 'c1', now, weights: { blast_radius: 0, architecture_violations: 0, security_sensitivity: 0, historical_failure_rate: 1, test_confidence: 0, reversibility: 0, deployment_complexity: 0 }, thresholds: DEFAULT_AUTONOMY_BAND_THRESHOLDS }).autonomyBand;
  };
  assert.equal(band(25), 'autonomous');
  assert.equal(band(26), 'autonomous_with_review');
  assert.equal(band(50), 'autonomous_with_review');
  assert.equal(band(51), 'supervised');
  assert.equal(band(75), 'supervised');
  assert.equal(band(76), 'human_in_the_loop');
});

test('assessRisk: thresholds customizados são respeitados', () => {
  const input = baseInput({ blastRadiusCount: 15, testedPathsRatio: 1 }); // 50% de blast_radius
  const assessment = assessRisk(input, {
    id: 'a1', changeId: 'c1', now,
    weights: { blast_radius: 1, architecture_violations: 0, security_sensitivity: 0, historical_failure_rate: 0, test_confidence: 0, reversibility: 0, deployment_complexity: 0 },
    thresholds: { autonomous: 60, autonomousWithReview: 80, supervised: 95 },
  });
  assert.equal(assessment.score, 50);
  assert.equal(assessment.autonomyBand, 'autonomous', 'com threshold customizado (autonomous até 60), score 50 ainda é autonomous');
});

test('createRiskEngine: interface .assess() delega para assessRisk com a config fechada', () => {
  const engine = createRiskEngine({ weights: { blast_radius: 1, architecture_violations: 0, security_sensitivity: 0, historical_failure_rate: 0, test_confidence: 0, reversibility: 0, deployment_complexity: 0 } });
  const assessment = engine.assess(baseInput({ blastRadiusCount: 30 }), { id: 'a1', changeId: 'c1', now });
  assert.equal(assessment.score, 100);
});

test('explainAssessment: texto legível contém score, banda e todos os 7 fatores', () => {
  const assessment = assessRisk(baseInput(), { id: 'a1', changeId: 'minha-mudança', now });
  const text = explainAssessment(assessment);
  assert.match(text, /a1/);
  assert.match(text, /minha-mudança/);
  assert.match(text, /score 5\/100/);
  for (const name of ['blast_radius', 'architecture_violations', 'security_sensitivity', 'historical_failure_rate', 'test_confidence', 'reversibility', 'deployment_complexity']) {
    assert.match(text, new RegExp(name));
  }
  assert.match(text, /sem dado real/, 'fatores sem dado real (histórico, teste) devem ser sinalizados no texto');
});
