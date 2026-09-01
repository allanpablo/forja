# Plan: Change Risk Engine

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-01

## 1. Abordagem técnica

Novo bounded context `packages/engineering/risk` (autorizado por ADR-0078), puro domínio — a
fórmula dos 7 fatores (§9 do doc de arquitetura) roda inteira sobre um `RiskInput` já calculado,
sem `fs`/rede/SQLite. Quem coleta os números reais é `scripts/risk.ts` (adapter), reaproveitando
integralmente o que Sprint 1 já construiu: `GraphLoop.impact()` para blast radius,
`checkConstitution` (SPEC-033) para violações de arquitetura, `SqliteObservationStore` (já
existente em `packages/adapter-sqlite`) para taxa histórica de falha. Nenhuma tabela SQLite nova.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `packages/engineering/risk/src/index.ts` | novo — `assessRisk`, `explainAssessment`, `createRiskEngine`, pesos/thresholds default | Médio — lógica nova, pura/testável |
| `scripts/risk.ts` | novo — `risk:assess`/`risk:explain`, coleta blast radius/violações/histórico/testes/serviços reais | Médio — bastante integração, mas cada peça já existe |
| `lib/core/registry.ts` | 2 comandos novos | Baixo |
| `packages/policy/src/index.ts` | `PolicyScope.riskScoreRange` + `PolicyRequest.riskScore` (campos aditivos, sem import de `@forja/engineering-risk`) | Baixo — extensão aditiva, mesmo padrão de `maxCostUsd` (SPEC-029) |
| `test/risk-engine.test.js` (novo) | testes puros do motor: fórmula, confidence, bandas | — |
| `test/risk-cli.test.js` (novo) | fixture git isolada: `risk:assess`/`risk:explain` ponta a ponta | — |
| `test/policy.test.js` | +1 teste: `riskScoreRange` na `matches()` | — |

## 3. Diagrama de fluxo

```text
git diff --name-only [ref]           (scripts/risk.ts, coleta)
        │
        ├── GraphLoop.impact(origin) ──────────► blast_radius
        ├── checkConstitution (constitution.json + arestas DEPENDS_ON) ─► architecture_violations
        ├── heurística de path (secrets/database/deployment) ─────────► security_sensitivity
        ├── SqliteObservationStore.list() filtrado por files ──────────► historical_failure_rate
        ├── existência de test/<nome>.test.js ──────────────────────────► test_confidence
        ├── path casa /migration|schema/ ────────────────────────────────► reversibility
        └── packages/*, apps/* distintos tocados ────────────────────────► deployment_complexity
                                       │
                                       ▼
                          assessRisk(input) [packages/engineering/risk, puro]
                                       │
                                       ▼
                    ChangeRiskAssessment (score, confidence, autonomyBand, factors[])
                                       │
                                       ▼
                     .context/risk/<id>.json (efêmero, mesma categoria de forja-runs.jsonl)
```

## 4. Contratos (API/CLI/Schema)

```ts
// packages/engineering/risk/src/index.ts
export type RiskFactorName = 'blast_radius' | 'architecture_violations' | 'security_sensitivity'
  | 'historical_failure_rate' | 'test_confidence' | 'reversibility' | 'deployment_complexity';
export type RiskWeights = Readonly<Record<RiskFactorName, number>>;
export const DEFAULT_RISK_WEIGHTS: RiskWeights; // soma 1.0, pesos do §9 do doc de arquitetura
export interface AutonomyBandThresholds { readonly autonomous: number; readonly autonomousWithReview: number; readonly supervised: number; }
export const DEFAULT_AUTONOMY_BAND_THRESHOLDS: AutonomyBandThresholds; // 25/50/75 — >75 = human_in_the_loop
export type AutonomyBand = 'autonomous' | 'autonomous_with_review' | 'supervised' | 'human_in_the_loop';
export interface RiskInput { /* 7 métricas cruas + evidenceIds por fator — ver código */ }
export interface RiskFactorResult { readonly name: RiskFactorName; readonly weight: number; readonly value: number; readonly hasRealData: boolean; readonly evidenceIds: readonly string[]; readonly rationale: string; }
export interface ChangeRiskAssessment { readonly id: string; readonly changeId: string; readonly createdAt: string; readonly score: number; readonly confidence: number; readonly autonomyBand: AutonomyBand; readonly factors: readonly RiskFactorResult[]; }
export function assessRisk(input: RiskInput, options: { id: string; changeId: string; now: string; weights?: Partial<RiskWeights>; thresholds?: AutonomyBandThresholds }): ChangeRiskAssessment;
export function explainAssessment(assessment: ChangeRiskAssessment): string;
export interface RiskEngine { assess(input: RiskInput, meta: { id: string; changeId: string; now: string }): ChangeRiskAssessment; }
export function createRiskEngine(config?: { weights?: Partial<RiskWeights>; thresholds?: AutonomyBandThresholds }): RiskEngine;
```

```bash
risk:assess [ref]          # default: diff do working tree vs. HEAD
risk:explain <assessment-id>
```

```ts
// packages/policy/src/index.ts — extensão aditiva
export interface PolicyScope { /* ...campos existentes... */ readonly riskScoreRange?: readonly [number, number]; }
export interface PolicyRequest { /* ...campos existentes... */ readonly riskScore?: number; }
```

## 5. Decisões e alternativas

**D1**: `risk:assess` recebe um **git ref opcional** (`risk:assess [ref]`), não uma string livre em
linguagem natural. A visão original e o §12 (CLI Plan) escrevem `risk:assess "<mudança>"`, que lido
literalmente sugeriria parsing de texto — incompatível com o NFR "nenhum fator depende de chamada de
LLM" e com AC-1 (fatores determinísticos). Sem `ref`, compara o working tree contra `HEAD` (mudança
não commitada ainda, o caso mais comum ao decidir política antes de commitar); com `ref`, compara
`<ref>^..<ref>`. Mesma resolução já dada a `adr:impact <id>` (recebe um id concreto, não prosa).

**D2**: assessments são persistidos em `.context/risk/<id>.json`, efêmero (fora do git, mesma
categoria de `.context/forja-runs.jsonl` — já ignorado pelo `.gitignore` existente, nenhuma mudança
de allowlist necessária, ao contrário de `constitution.json` que é fonte de verdade versionada).
`risk:explain` lê de volta esse arquivo. Alternativa rejeitada: nova tabela SQLite — violaria a NFR
"nenhuma tabela SQLite nova" desta spec (§6, redigida pelo próprio autor da spec) sem necessidade;
um assessment é um artefato de leitura pontual, não algo que precisa de índice/query relacional.

**D3**: `PolicyRequest.riskScore` é um `number` simples (0-100), não `ChangeRiskAssessment` completo
como o texto solto da visão original sugeria. `PolicyEngine` só precisa do score para casar
`riskScoreRange` — carregar o assessment inteiro obrigaria `packages/policy` a conhecer o shape de
`ChangeRiskAssessment`, violando AC-5 ("policy não importa `packages/engineering/risk`
diretamente") por tipo estrutural equivalente a import. Quem quiser o assessment completo já tem
`risk:explain <id>` ou chama `RiskEngine.assess()` diretamente antes de montar o `PolicyRequest`.

**D4**: fatores sem dado real (`historical_failure_rate` em cold start, `test_confidence` quando a
heurística de arquivo de teste não encontra nada) entram no cálculo com um valor neutro (0 para
histórico — "sem evidência de falha" não é o mesmo que "sem risco", mas é a leitura mais honesta
disponível; 0.5 para teste — literalmente "desconhecido") e `hasRealData: false`, nunca são
omitidos do score. `confidence` cai proporcionalmente (AC-3) em vez de o assessment inteiro falhar
ou mentir com 100% de confiança.

## 6. Dependências

- SPEC-032 (Engineering Graph) — `GraphLoop.impact()` para blast radius.
- SPEC-033 (Architecture Constitution) — `checkConstitution` para o fator de violação; roda com
  zero regras (`architectureViolationCount: 0`) se `constitution.json` ainda não foi compilado,
  não é erro bloqueante.
- `packages/adapter-sqlite.SqliteObservationStore` (já existente, sem migração nova).

## 7. Rollout

- [ ] Feature flag necessária? Não — comando novo, opt-in por natureza.
- [ ] Migração de dados existentes? Não.
- [ ] Doc/persona impactada? README (comandos novos), `docs/architecture/`.

## 8. Sinais de fracasso (kill criteria)

Já registrado no apêndice de `specs/engineering-intelligence/spec.md`: se `risk:assess` sobre as 5
mudanças históricas do §8 do spec não ordenar de acordo com julgamento humano, os pesos/fórmula são
revisados antes de avançar para o Sprint 3 (Evidence Ledger, que agrega o que Risk já produziu).
