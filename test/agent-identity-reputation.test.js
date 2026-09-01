import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeReputationScore, DEFAULT_REPUTATION_THRESHOLDS, recommendAgent } from '../packages/engineering/identity/src/index.ts';

const now = '2026-09-01T00:00:00.000Z';

function report(metrics, observationIds = ['obs-1', 'obs-2', 'obs-3', 'obs-4', 'obs-5']) {
  return {
    schemaVersion: '2.0', id: 'report-1', createdAt: now, updatedAt: now, correlationId: 'c',
    scope: 'agent', scopeId: 'agent-1', observationIds, metrics: { observationCount: observationIds.length, ...metrics },
    findings: [],
  };
}

test('computeReputationScore: agente perfeito (100% sucesso, sem retrabalho/rollback) tira trustLevel 5', () => {
  const score = computeReputationScore(report({ successRate: 1, reworkRate: 0, rollbackRate: 0, assertionsWithoutEvidenceRate: 0 }), { agentId: 'agent-1' });
  assert.equal(score.trustLevel, 5);
  assert.equal(score.autonomyLevel, 'autonomous');
});

test('computeReputationScore: agente péssimo (0% sucesso, tudo falhando) tira trustLevel 0', () => {
  const score = computeReputationScore(report({ successRate: 0, reworkRate: 1, rollbackRate: 1, assertionsWithoutEvidenceRate: 1 }), { agentId: 'agent-1' });
  assert.equal(score.trustLevel, 0);
  assert.equal(score.autonomyLevel, 'human_in_the_loop');
});

test('computeReputationScore: zero Observation (nunca rodou) tira trustLevel 0, não um 3/5 "neutro" — achado real, ver nota no código', () => {
  // EvaluationEngine.rate() devolve 0 (não undefined) pra toda métrica quando o total é 0 — sem a
  // guarda de sampleSize===0 em trustLevelFrom, reworkRate/rollbackRate zerados por ausência de
  // dado seriam lidos como "bom sinal" pela fórmula e produziriam ~3/5 do nada.
  const score = computeReputationScore(report({ successRate: 0, reworkRate: 0, rollbackRate: 0, assertionsWithoutEvidenceRate: 0, observationCount: 0 }, []), { agentId: 'agent-1' });
  assert.equal(score.sampleSize, 0);
  assert.equal(score.trustLevel, 0);
  assert.equal(score.autonomyLevel, 'human_in_the_loop');
  assert.equal(score.confidence, 0);
});

test('computeReputationScore: cold start (amostra abaixo de minSampleSize) força human_in_the_loop mesmo com métricas perfeitas', () => {
  const score = computeReputationScore(report({ successRate: 1, reworkRate: 0, rollbackRate: 0, assertionsWithoutEvidenceRate: 0 }, ['obs-1', 'obs-2']), { agentId: 'agent-1' });
  assert.equal(score.sampleSize, 2);
  assert.equal(score.autonomyLevel, 'human_in_the_loop', 'trustLevel alto não basta — amostra pequena é fail-closed (AC-3)');
  assert.ok(score.confidence < 1, 'confidence deve refletir a amostra pequena, nunca escondida');
});

test('computeReputationScore: confidence é proporcional ao tamanho da amostra (min 1.0)', () => {
  const small = computeReputationScore(report({ successRate: 1, reworkRate: 0, rollbackRate: 0, assertionsWithoutEvidenceRate: 0 }, ['obs-1']), { agentId: 'agent-1' });
  const enough = computeReputationScore(report({ successRate: 1, reworkRate: 0, rollbackRate: 0, assertionsWithoutEvidenceRate: 0 }), { agentId: 'agent-1' });
  const overflowing = computeReputationScore(report({ successRate: 1, reworkRate: 0, rollbackRate: 0, assertionsWithoutEvidenceRate: 0 }, Array.from({ length: 50 }, (_, i) => `obs-${i}`)), { agentId: 'agent-1' });
  assert.equal(small.confidence, 1 / DEFAULT_REPUTATION_THRESHOLDS.minSampleSize);
  assert.equal(enough.confidence, 1);
  assert.equal(overflowing.confidence, 1, 'confidence tem teto em 1.0, não passa disso');
});

test('computeReputationScore: thresholds customizados são respeitados', () => {
  const custom = { minSampleSize: 1, autonomous: 5, autonomousWithReview: 4, supervised: 2 };
  const score = computeReputationScore(report({ successRate: 0.7, reworkRate: 0, rollbackRate: 0, assertionsWithoutEvidenceRate: 0 }, ['obs-1']), { agentId: 'agent-1', thresholds: custom });
  assert.equal(score.trustLevel, 4);
  assert.equal(score.autonomyLevel, 'autonomous_with_review', 'trustLevel 4 com threshold autonomous=5 fica abaixo do topo, mas alcança autonomousWithReview=4');
});

test('computeReputationScore: evidenceIds vem do observationIds do report, nunca inventado', () => {
  const score = computeReputationScore(report({ successRate: 1, reworkRate: 0, rollbackRate: 0, assertionsWithoutEvidenceRate: 0 }, ['obs-x', 'obs-y']), { agentId: 'agent-1' });
  assert.deepEqual(score.evidenceIds, ['obs-x', 'obs-y']);
});

test('computeReputationScore: domain aparece no resultado só quando fornecido', () => {
  const withDomain = computeReputationScore(report({ successRate: 1, reworkRate: 0, rollbackRate: 0, assertionsWithoutEvidenceRate: 0 }), { agentId: 'agent-1', domain: 'backend' });
  const withoutDomain = computeReputationScore(report({ successRate: 1, reworkRate: 0, rollbackRate: 0, assertionsWithoutEvidenceRate: 0 }), { agentId: 'agent-1' });
  assert.equal(withDomain.domain, 'backend');
  assert.equal('domain' in withoutDomain, false);
});

function profile(overrides = {}) {
  return { id: 'agent-1', schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: 'c', role: 'developer', capabilities: [], architectureDomains: [], ...overrides };
}

test('recommendAgent: role e domain casados somam, trustLevel entra proporcionalmente', () => {
  const profiles = [
    profile({ id: 'a', role: 'developer', architectureDomains: ['backend'], trustLevel: 5, autonomyLevel: 'autonomous' }),
    profile({ id: 'b', role: 'developer', architectureDomains: [] }),
    profile({ id: 'c', role: 'reviewer', architectureDomains: ['backend'] }),
  ];
  const ranking = recommendAgent(profiles, { role: 'developer', domain: 'backend' });
  assert.deepEqual(ranking.map((r) => r.agentId), ['a', 'b', 'c']);
  assert.equal(ranking[0].score, 100 + 50 + 50); // role + domain + trustLevel(5)*10
});

test('recommendAgent: agente sem trustLevel ainda não é excluído, motivo declara isso', () => {
  const ranking = recommendAgent([profile({ id: 'a', role: 'developer' })], { role: 'developer' });
  assert.equal(ranking.length, 1);
  assert.equal(ranking[0].score, 100);
  assert.match(ranking[0].reasons.join(' '), /sem pontuação ainda/);
});

test('recommendAgent: sem domain no critério, domainMatch nunca conta', () => {
  const ranking = recommendAgent([profile({ id: 'a', role: 'developer', architectureDomains: ['backend'] })], { role: 'developer' });
  assert.equal(ranking[0].score, 100);
});

test('recommendAgent: empate por score desempata por agentId (ordem determinística)', () => {
  const ranking = recommendAgent([profile({ id: 'z', role: 'developer' }), profile({ id: 'a', role: 'developer' })], { role: 'developer' });
  assert.deepEqual(ranking.map((r) => r.agentId), ['a', 'z']);
});
