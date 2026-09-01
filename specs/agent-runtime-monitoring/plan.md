# Plan: Agent Runtime Monitoring / Behavior Anomaly Engine

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-01

## 1. Abordagem técnica

Novo sub-domínio `packages/engineering/monitoring`, puro: `detectAnomaly(baseline, recent)`
compara dois `EvaluationReport` (mesma fonte que `computeReputationScore` consome, SPEC-036) fator
a fator. `scripts/agent.ts` ganha `agent:monitor` (mesmo script de domínio de SPEC-036/037 — não um
script novo), que busca `Observation`s reais e monta os dois `EvaluationReport` (linha de base =
tudo antes da janela; recente = últimas N horas), reaproveitando `EvaluationEngine` sem
reimplementar nenhuma métrica.

`packages/policy` ganha `anomalyScoreRange`/`anomalyScore`, campo `number` puro — mesmo padrão
exato de `riskScoreRange`/`riskScore` (SPEC-034): nenhum import de `packages/engineering/monitoring`.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `packages/engineering/monitoring/src/index.ts` | novo — `detectAnomaly` | Baixo — comparação pura |
| `scripts/agent.ts` | `agent:monitor` novo subcomando | Baixo |
| `packages/policy/src/index.ts` | `anomalyScoreRange`/`anomalyScore` (aditivo) | Baixo |
| `lib/core/registry.ts` | 1 comando novo | Baixo |
| `test/agent-runtime-monitoring.test.js` (novo) | unit de `detectAnomaly` | — |
| `test/policy.test.js` | +teste de `anomalyScoreRange` | — |
| `test/agent-cli.test.js` | +teste de CLI de `agent:monitor` | — |

## 3. Contratos

```ts
// packages/engineering/monitoring/src/index.ts
export interface AnomalySignal { readonly metric: string; readonly baseline: number; readonly recent: number; readonly delta: number; }
export interface AnomalyAssessment { readonly agentId: string; readonly score: number; readonly confidence: number; readonly signals: readonly AnomalySignal[]; }
export function detectAnomaly(agentId: string, baseline: EvaluationReport, recent: EvaluationReport, options?: { minSampleSize?: number }): AnomalyAssessment;
```

Fórmula (D1): compara `successRate`, `reworkRate`, `rollbackRate` (as 3 métricas de qualidade já
usadas em `computeReputationScore`, D1 de SPEC-036 — mesmo vocabulário, não um novo). Para cada
métrica, `delta = recent - baseline` (sinal importa: `successRate` caindo é ruim, `reworkRate`/
`rollbackRate` subindo é ruim). `score = min(100, round(100 * (max(0, -deltaSuccessRate) * 0.5 +
max(0, deltaReworkRate) * 0.25 + max(0, deltaRollbackRate) * 0.25)))`. `confidence` = `min(1,
min(baseline.observationCount, recent.observationCount) / minSampleSize)` (default `minSampleSize:
5`, mesmo valor default de `DEFAULT_REPUTATION_THRESHOLDS.minSampleSize` em SPEC-036 — consistência
entre os dois motores de agente).

```bash
agent:monitor <id> [--window-hours <n>]   # default 24
```

```ts
// packages/policy/src/index.ts — extensão aditiva
export interface PolicyScope { /* ...campos existentes... */ readonly anomalyScoreRange?: readonly [number, number]; }
export interface PolicyRequest { /* ...campos existentes... */ readonly anomalyScore?: number; }
```

## 4. Decisões

**D1**: fórmula reaproveita as mesmas 3 métricas de `computeReputationScore` (successRate/
reworkRate/rollbackRate) — vocabulário consistente entre os dois motores de comportamento de
agente, em vez de inventar um conjunto de métricas diferente pra "anomalia" vs. "reputação".

**D2**: `anomalyScoreRange`/`anomalyScore` seguem exatamente o padrão de `riskScoreRange`/
`riskScore` (mesmo formato `[number, number]`, mesmo `matches()` em `PolicyEngine`, mesmo raciocínio
de D3 de SPEC-034: campo `number` puro, não o `AnomalyAssessment` inteiro) — consistência de design
entre os dois scores que `PolicyEngine` pode consultar.

## 5. Rollout

Sem migração, sem feature flag.

## 6. Kill criteria

Já coberto pelo mesmo princípio das specs anteriores — se `detectAnomaly` sinalizar anomalia sem
correspondência a julgamento humano sobre dado real, os pesos de D1 são revisados antes de
qualquer regra de política real usar `anomalyScoreRange` (§5 do spec, "Fora").
