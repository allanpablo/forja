# Tasks: Change Risk Engine

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-01

---

## T1 — engine puro: fórmula + confidence + bandas de autonomia
- **Owner**: worker
- **Estimativa**: G
- **Depende de**: —
- **Paths**: `packages/engineering/risk/src/index.ts`
- **Done quando**:
  - [ ] `assessRisk` implementa os 7 fatores com os pesos default de §9 do doc de arquitetura
        (soma 1.0), pesos sobrescrevíveis via `options.weights`
  - [ ] `confidence` = fração de fatores com `hasRealData: true` (AC-3)
  - [ ] `autonomyBand` usa `AutonomyBandThresholds` configurável, default 25/50/75 (AC-6)
  - [ ] cada `RiskFactorResult` carrega `evidenceIds` (passthrough do `RiskInput`, nunca inventado
        pelo engine) — AC-2
  - [ ] testes unitários (sem `fs`/rede): fator sem dado real reduz `confidence` mas não quebra o
        score; pesos customizados mudam o resultado; as 4 bandas de autonomia nos limites exatos
        (25/26/50/51/75/76)

## T2 — `scripts/risk.ts`: coleta real + `risk:assess`/`risk:explain`
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `scripts/risk.ts`, `lib/core/registry.ts`
- **Done quando**:
  - [ ] blast radius via `GraphLoop.impact()` sobre o grafo real (reindexado como
        `adr:*`/`architecture:*` já fazem)
  - [ ] violações de arquitetura via `checkConstitution` sobre `constitution.json` (SPEC-033),
        escopadas aos arquivos alterados
  - [ ] taxa histórica de falha via `SqliteObservationStore.list()` filtrado por `files`
        (cold start = `undefined`, não 0 mentiroso)
  - [ ] `risk:assess [ref]` grava `.context/risk/<id>.json` (D2 do plan) e imprime
        `explainAssessment`
  - [ ] `risk:explain <id>` lê o arquivo de volta
  - [ ] `forja tools:doctor` continua verde (comandos documentados no README)

## T3 — integração opcional com Policy Engine
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `packages/policy/src/index.ts`, `test/policy.test.js`
- **Done quando**:
  - [ ] `PolicyScope.riskScoreRange`/`PolicyRequest.riskScore` (D3 do plan — `number`, não o
        assessment inteiro)
  - [ ] `PolicyEngine.matches()` respeita `riskScoreRange` quando presente, sem quebrar nenhuma
        regra existente que não o declara (campo opcional)
  - [ ] `packages/policy` continua sem importar `packages/engineering/risk` (AC-5, checável por
        `grep -r "engineering-risk\|engineering/risk" packages/policy/src`)

## T4 — prova sobre dado real
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: T2
- **Paths**: `test/risk-cli.test.js` (novo)
- **Done quando**:
  - [ ] fixture git isolada com 2+ pacotes, uma mudança que toca 1 arquivo: `risk:assess` produz
        score+fatores+confidence coerentes com os dados da fixture (blast radius > 0, sem histórico
        → `historical_failure_rate.hasRealData === false`)
  - [ ] `risk:explain <id>` recupera o mesmo assessment

---

## Handoffs entre agentes

T1 → (T2, T3 em paralelo, ambas só dependem de T1) → T4. Sem handoff de papel — spec e plan já
aprovados cobrem as decisões de produto/arquitetura.
