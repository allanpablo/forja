/**
 * @forja/engineering-monitoring — Agent Runtime Monitoring / Behavior Anomaly Engine (SPEC-040).
 *
 * Domínio puro: `detectAnomaly` compara dois `EvaluationReport` (linha de base + recente, ambos já
 * produzidos por `packages/evals.EvaluationEngine` — nenhuma métrica reimplementada aqui) e devolve
 * um `AnomalyAssessment`. Nenhum `fs`/rede/SQLite — a coleta de `Observation`s por janela de tempo
 * vive em `scripts/agent.ts`.
 *
 * "Dentro de Policy, não paralelo" (gap analysis original): o cálculo mora aqui, separado; a
 * *decisão* continua sendo do `PolicyEngine`/humano — `packages/policy` ganha um campo `number`
 * opcional (`anomalyScore`) pra consultar isto, exatamente como `riskScore` já faz pra risco
 * (SPEC-034 D3). `detectAnomaly` nunca decide nada sozinho.
 */

import type { EvaluationReport } from '../../../contracts/src/index.ts';

export interface AnomalySignal {
  readonly metric: string;
  readonly baseline: number;
  readonly recent: number;
  readonly delta: number;
}

export interface AnomalyAssessment {
  readonly agentId: string;
  /** 0-100. */
  readonly score: number;
  /** 0-1 — proporcional ao menor dos dois tamanhos de amostra, nunca escondida (AC-2). */
  readonly confidence: number;
  readonly signals: readonly AnomalySignal[];
}

const DEFAULT_MIN_SAMPLE_SIZE = 5;

function signal(metric: string, baseline: Readonly<Record<string, number>>, recent: Readonly<Record<string, number>>): AnomalySignal {
  const baselineValue = baseline[metric] ?? 0;
  const recentValue = recent[metric] ?? 0;
  return { metric, baseline: baselineValue, recent: recentValue, delta: recentValue - baselineValue };
}

/**
 * `score` = 0.5·max(0, -ΔsuccessRate) + 0.25·max(0, ΔreworkRate) + 0.25·max(0, ΔrollbackRate),
 * escalado 0-100 — mesmo vocabulário de métricas de `computeReputationScore` (D1 do plan, SPEC-036),
 * só o sinal muda (aqui é desvio de linha de base, não nível absoluto). Só a direção "ruim" de cada
 * métrica conta — sucesso subindo ou retrabalho/rollback caindo nunca aumentam o score.
 */
export function detectAnomaly(agentId: string, baseline: EvaluationReport, recent: EvaluationReport, options?: { readonly minSampleSize?: number }): AnomalyAssessment {
  const minSampleSize = options?.minSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE;
  const signals = [
    signal('successRate', baseline.metrics, recent.metrics),
    signal('reworkRate', baseline.metrics, recent.metrics),
    signal('rollbackRate', baseline.metrics, recent.metrics),
  ];
  const [successSignal, reworkSignal, rollbackSignal] = signals;
  const raw = 0.5 * Math.max(0, -successSignal.delta) + 0.25 * Math.max(0, reworkSignal.delta) + 0.25 * Math.max(0, rollbackSignal.delta);
  const score = Math.min(100, Math.max(0, Math.round(raw * 100)));

  const baselineSampleSize = baseline.metrics.observationCount ?? baseline.observationIds.length;
  const recentSampleSize = recent.metrics.observationCount ?? recent.observationIds.length;
  const confidence = Math.min(1, Math.min(baselineSampleSize, recentSampleSize) / minSampleSize);

  return { agentId, score, confidence, signals };
}
