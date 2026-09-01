/**
 * @forja/engineering-identity — Agent Reputation (SPEC-036).
 *
 * Domínio puro: `computeReputationScore` recebe um `EvaluationReport` já produzido por
 * `packages/evals.EvaluationEngine` (reaproveitado, não reimplementado — nenhuma métrica nova
 * calculada aqui) e devolve um `AgentReputationScore`. Nenhum `fs`/rede/SQLite — a persistência
 * (`SqliteAgentProfileStore`) e a coleta de `Observation`s vivem em `scripts/agent.ts`.
 */

import type { EvaluationReport } from '../../../contracts/src/index.ts';

export type AutonomyLevel = 'autonomous' | 'autonomous_with_review' | 'supervised' | 'human_in_the_loop';

export interface AgentReputationScore {
  readonly agentId: string;
  readonly domain?: string;
  /** 0-5. */
  readonly trustLevel: number;
  readonly autonomyLevel: AutonomyLevel;
  /** 0-1 — proporcional ao tamanho da amostra, nunca escondida (AC-2). */
  readonly confidence: number;
  readonly sampleSize: number;
  readonly metrics: Readonly<Record<string, number>>;
  readonly evidenceIds: readonly string[];
}

export interface ReputationThresholds {
  /** Abaixo disso, `autonomyLevel` é sempre `human_in_the_loop` — fail-closed em cold start (AC-3). */
  readonly minSampleSize: number;
  /** `trustLevel` mínimo (escala 0-5) para cada banda, do mais alto para o mais baixo. */
  readonly autonomous: number;
  readonly autonomousWithReview: number;
  readonly supervised: number;
}

/** Sugeridos na visão original — configuração default, nunca constante fixa (mesmo princípio de RiskEngine/SPEC-034). */
export const DEFAULT_REPUTATION_THRESHOLDS: ReputationThresholds = {
  minSampleSize: 5,
  autonomous: 4,
  autonomousWithReview: 3,
  supervised: 1,
};

/**
 * `trustLevel` = 0.5·successRate + 0.2·(1-reworkRate) + 0.2·(1-rollbackRate) +
 * 0.1·(1-assertionsWithoutEvidenceRate), escalado 0-5. Pesos documentados aqui e no plan
 * (D1) — nunca "número mágico" (mesmo princípio de RiskEngine).
 *
 * `sampleSize === 0` é tratado à parte, ANTES da fórmula: `EvaluationEngine.rate()` devolve `0`
 * (não `undefined`) para toda métrica quando não há `Observation` nenhuma — a fórmula acima leria
 * esses zeros de "sem dado" como reworkRate/rollbackRate/assertionsWithoutEvidenceRate = 0 (bom
 * sinal!) e produziria um trustLevel médio (~3/5) sem nenhuma evidência real por trás. Isso
 * contradiz AC-2 ("nunca escondida"): 0 observações é 0 de confiança, não neutro.
 */
function trustLevelFrom(metrics: Readonly<Record<string, number>>, sampleSize: number): number {
  if (sampleSize === 0) return 0;
  const successRate = metrics.successRate ?? 0;
  const reworkRate = metrics.reworkRate ?? 0;
  const rollbackRate = metrics.rollbackRate ?? 0;
  const assertionsWithoutEvidenceRate = metrics.assertionsWithoutEvidenceRate ?? 0;
  const raw = 0.5 * successRate + 0.2 * (1 - reworkRate) + 0.2 * (1 - rollbackRate) + 0.1 * (1 - assertionsWithoutEvidenceRate);
  return Math.min(5, Math.max(0, Math.round(raw * 5)));
}

function autonomyLevelFor(trustLevel: number, sampleSize: number, thresholds: ReputationThresholds): AutonomyLevel {
  if (sampleSize < thresholds.minSampleSize) return 'human_in_the_loop';
  if (trustLevel >= thresholds.autonomous) return 'autonomous';
  if (trustLevel >= thresholds.autonomousWithReview) return 'autonomous_with_review';
  if (trustLevel >= thresholds.supervised) return 'supervised';
  return 'human_in_the_loop';
}

export function computeReputationScore(
  report: EvaluationReport,
  meta: { readonly agentId: string; readonly domain?: string; readonly thresholds?: ReputationThresholds },
): AgentReputationScore {
  const thresholds = meta.thresholds ?? DEFAULT_REPUTATION_THRESHOLDS;
  const sampleSize = report.metrics.observationCount ?? report.observationIds.length;
  const trustLevel = trustLevelFrom(report.metrics, sampleSize);
  return {
    agentId: meta.agentId,
    ...(meta.domain === undefined ? {} : { domain: meta.domain }),
    trustLevel,
    autonomyLevel: autonomyLevelFor(trustLevel, sampleSize, thresholds),
    confidence: Math.min(1, sampleSize / thresholds.minSampleSize),
    sampleSize,
    metrics: report.metrics,
    evidenceIds: report.observationIds,
  };
}
