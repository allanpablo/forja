/**
 * @forja/engineering-risk — Change Risk Engine (SPEC-034).
 *
 * Domínio puro: nenhum `fs`/rede/SQLite aqui. `assessRisk` recebe métricas já coletadas por um
 * adapter (`scripts/risk.ts`) e aplica a fórmula documentada em
 * `docs/architecture/FORJA-3-ENGINEERING-INTELLIGENCE-ARCHITECTURE.md` §9: 7 fatores nomeados,
 * pesos configuráveis (nunca constante escondida), cada fator carregando os `evidenceIds` que o
 * adapter coletou — o engine nunca inventa evidência, só soma o que recebeu (AC-2).
 */

export type RiskFactorName =
  | 'blast_radius'
  | 'architecture_violations'
  | 'security_sensitivity'
  | 'historical_failure_rate'
  | 'test_confidence'
  | 'reversibility'
  | 'deployment_complexity';

export type RiskWeights = Readonly<Record<RiskFactorName, number>>;

/** Pesos default do §9 do doc de arquitetura — somam 1.0. Sempre sobrescrevíveis via `options.weights` (AC-1). */
export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  blast_radius: 0.20,
  architecture_violations: 0.20,
  security_sensitivity: 0.15,
  historical_failure_rate: 0.15,
  test_confidence: 0.10,
  reversibility: 0.10,
  deployment_complexity: 0.10,
};

export interface AutonomyBandThresholds {
  /** Score máximo (inclusive) ainda considerado 'autonomous'. */
  readonly autonomous: number;
  /** Score máximo (inclusive) ainda 'autonomous_with_review'. */
  readonly autonomousWithReview: number;
  /** Score máximo (inclusive) ainda 'supervised'; acima disso, 'human_in_the_loop'. */
  readonly supervised: number;
}

/** Faixas sugeridas na visão original (0-25/26-50/51-75/76-100) — configuração default, nunca constante fixa (AC-6). */
export const DEFAULT_AUTONOMY_BAND_THRESHOLDS: AutonomyBandThresholds = {
  autonomous: 25,
  autonomousWithReview: 50,
  supervised: 75,
};

export type AutonomyBand = 'autonomous' | 'autonomous_with_review' | 'supervised' | 'human_in_the_loop';

/**
 * Métricas cruas já coletadas pelo adapter (grafo, `architecture:check`, `Observation` histórica,
 * heurísticas de path). Cada campo tem seu par de evidência — nada entra no score sem rastro de
 * onde veio (AC-2). Campos `?:` (histórico, teste) podem ser `undefined` — cold start é esperado,
 * não erro (AC-3, D4 do plan).
 */
export interface RiskInput {
  readonly blastRadiusCount: number;
  readonly blastRadiusEvidenceIds: readonly string[];
  readonly architectureViolationCount: number;
  readonly architectureViolationEvidenceIds: readonly string[];
  readonly sensitiveCategoriesTouched: readonly string[];
  readonly sensitiveCategoryEvidenceIds: readonly string[];
  readonly historicalFailureRate?: number;
  readonly historicalEvidenceIds: readonly string[];
  readonly testedPathsRatio?: number;
  readonly testEvidenceIds: readonly string[];
  readonly touchesSchemaOrMigration: boolean;
  readonly reversibilityEvidenceIds: readonly string[];
  readonly affectedServiceCount: number;
  readonly totalServiceCount: number;
  readonly deploymentEvidenceIds: readonly string[];
}

export interface RiskFactorResult {
  readonly name: RiskFactorName;
  readonly weight: number;
  /** Normalizado 0-1. */
  readonly value: number;
  /** `false` = cold start / dado indisponível; o fator ainda participa do score (com valor neutro), mas `confidence` cai. */
  readonly hasRealData: boolean;
  readonly evidenceIds: readonly string[];
  readonly rationale: string;
}

export interface ChangeRiskAssessment {
  readonly id: string;
  readonly changeId: string;
  readonly createdAt: string;
  /** 0-100. */
  readonly score: number;
  /** 0-1, fração de fatores com `hasRealData: true`. */
  readonly confidence: number;
  readonly autonomyBand: AutonomyBand;
  readonly factors: readonly RiskFactorResult[];
}

export interface RiskAssessMeta {
  readonly id: string;
  readonly changeId: string;
  readonly now: string;
  readonly weights?: Partial<RiskWeights>;
  readonly thresholds?: AutonomyBandThresholds;
}

const BLAST_RADIUS_CAP = 30;
const ARCHITECTURE_VIOLATION_CAP = 5;
const SENSITIVE_CATEGORY_VOCAB = ['secrets', 'database', 'deployment'] as const;

function computeFactors(input: RiskInput, weights: RiskWeights): readonly RiskFactorResult[] {
  const blastValue = Math.min(1, input.blastRadiusCount / BLAST_RADIUS_CAP);
  const architectureValue = Math.min(1, input.architectureViolationCount / ARCHITECTURE_VIOLATION_CAP);
  const sensitiveCount = SENSITIVE_CATEGORY_VOCAB.filter((category) => input.sensitiveCategoriesTouched.includes(category)).length;
  const securityValue = sensitiveCount / SENSITIVE_CATEGORY_VOCAB.length;
  const historicalHasData = input.historicalFailureRate !== undefined;
  const historicalValue = input.historicalFailureRate ?? 0;
  const testedHasData = input.testedPathsRatio !== undefined;
  const testValue = testedHasData ? 1 - (input.testedPathsRatio as number) : 0.5;
  const reversibilityValue = input.touchesSchemaOrMigration ? 1 : 0;
  const deploymentValue = input.totalServiceCount === 0 ? 0 : Math.min(1, input.affectedServiceCount / input.totalServiceCount);

  return [
    {
      name: 'blast_radius', weight: weights.blast_radius, value: blastValue, hasRealData: true,
      evidenceIds: input.blastRadiusEvidenceIds,
      rationale: `${input.blastRadiusCount} nó(s) alcançável(is) no Engineering Graph (cap ${BLAST_RADIUS_CAP})`,
    },
    {
      name: 'architecture_violations', weight: weights.architecture_violations, value: architectureValue, hasRealData: true,
      evidenceIds: input.architectureViolationEvidenceIds,
      rationale: `${input.architectureViolationCount} violação(ões) de architecture:check no escopo afetado (cap ${ARCHITECTURE_VIOLATION_CAP})`,
    },
    {
      name: 'security_sensitivity', weight: weights.security_sensitivity, value: securityValue, hasRealData: true,
      evidenceIds: input.sensitiveCategoryEvidenceIds,
      rationale: sensitiveCount === 0 ? 'nenhuma categoria sensível tocada' : `categorias tocadas: ${input.sensitiveCategoriesTouched.join(', ')}`,
    },
    {
      name: 'historical_failure_rate', weight: weights.historical_failure_rate, value: historicalValue, hasRealData: historicalHasData,
      evidenceIds: input.historicalEvidenceIds,
      rationale: historicalHasData ? `taxa de falha observada: ${(historicalValue * 100).toFixed(0)}%` : 'sem Observation histórica para os arquivos afetados — cold start',
    },
    {
      name: 'test_confidence', weight: weights.test_confidence, value: testValue, hasRealData: testedHasData,
      evidenceIds: input.testEvidenceIds,
      rationale: testedHasData ? `${((input.testedPathsRatio as number) * 100).toFixed(0)}% dos arquivos afetados têm teste associado` : 'cobertura de teste não determinada',
    },
    {
      name: 'reversibility', weight: weights.reversibility, value: reversibilityValue, hasRealData: true,
      evidenceIds: input.reversibilityEvidenceIds,
      rationale: input.touchesSchemaOrMigration ? 'toca migration/schema — baixa reversibilidade' : 'não toca migration/schema',
    },
    {
      name: 'deployment_complexity', weight: weights.deployment_complexity, value: deploymentValue, hasRealData: true,
      evidenceIds: input.deploymentEvidenceIds,
      rationale: `${input.affectedServiceCount} de ${input.totalServiceCount} pacote(s)/app(s) afetado(s)`,
    },
  ];
}

function autonomyBandFor(score: number, thresholds: AutonomyBandThresholds): AutonomyBand {
  if (score <= thresholds.autonomous) return 'autonomous';
  if (score <= thresholds.autonomousWithReview) return 'autonomous_with_review';
  if (score <= thresholds.supervised) return 'supervised';
  return 'human_in_the_loop';
}

export function assessRisk(input: RiskInput, meta: RiskAssessMeta): ChangeRiskAssessment {
  const weights: RiskWeights = { ...DEFAULT_RISK_WEIGHTS, ...meta.weights };
  const thresholds = meta.thresholds ?? DEFAULT_AUTONOMY_BAND_THRESHOLDS;
  const factors = computeFactors(input, weights);
  const score = Math.round(100 * factors.reduce((sum, factor) => sum + factor.weight * factor.value, 0));
  const confidence = Math.round((factors.filter((factor) => factor.hasRealData).length / factors.length) * 100) / 100;
  return {
    id: meta.id,
    changeId: meta.changeId,
    createdAt: meta.now,
    score,
    confidence,
    autonomyBand: autonomyBandFor(score, thresholds),
    factors,
  };
}

export function explainAssessment(assessment: ChangeRiskAssessment): string {
  const lines = [
    `${assessment.id} — mudança "${assessment.changeId}"`,
    `score ${assessment.score}/100 → ${assessment.autonomyBand} (confidence ${(assessment.confidence * 100).toFixed(0)}%)`,
    '',
  ];
  for (const factor of assessment.factors) {
    const flag = factor.hasRealData ? '' : ' (sem dado real)';
    lines.push(`${factor.name.padEnd(24)} peso ${factor.weight.toFixed(2)}  valor ${factor.value.toFixed(2)}${flag}`);
    lines.push(`  ${factor.rationale}`);
  }
  return lines.join('\n');
}

/** Interface pequena e opcional para quem quiser injetar o engine (ex.: montar `PolicyRequest.riskScore` antes de `authorize()`) sem acoplar ao módulo inteiro. */
export interface RiskEngine {
  assess(input: RiskInput, meta: { readonly id: string; readonly changeId: string; readonly now: string }): ChangeRiskAssessment;
}

export function createRiskEngine(config?: { readonly weights?: Partial<RiskWeights>; readonly thresholds?: AutonomyBandThresholds }): RiskEngine {
  return {
    assess: (input, meta) => assessRisk(input, { ...meta, weights: config?.weights, thresholds: config?.thresholds }),
  };
}
