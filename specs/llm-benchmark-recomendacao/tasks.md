# Tasks: llm-benchmark-recomendacao

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-08

```
T1 ─┐
T2 ─┼─ T3 ─ T4 ─ T5
```

Paralelizável: **T1 · T2**.

---

## T1 — `metrics()`: p50/p95 + custo por tarefa aprovada
- **Owner**: Worker · **Est**: P · **Depende de**: —
- **Paths**: `packages/evals/src/index.ts` (+ `packages/contracts/src/index.ts` se tipado)
- **Escopo**: helper `percentile(sorted: number[], p: number): number` (interpolação linear, `[]`→0).
  Em `metrics()`: `durationMsP50 = percentile(durações, 50)`, `durationMsP95 = percentile(…, 95)`;
  `costPerAcceptedTask = accepted === 0 ? 0 : totalCost / accepted`. As chaves existentes ficam
  **idênticas** para os mesmos dados.
- **Done**:
  - [ ] `tsc --noEmit` verde
  - [ ] teste: fixtures `[100,200,300,400]` → p50 ≈ 250, p95 ≈ 385; 0 aceita → `costPerAcceptedTask` 0

## T2 — `recommendProfile`: ponderação custo/latência + `evidence`
- **Owner**: Worker · **Est**: M · **Depende de**: —
- **Paths**: `packages/llm/src/index.ts`
- **Escopo**: helpers `median`/`mean`. `cohortMedianLatency` = mediana das `durationMs` de todas as
  amostras; `cohortMeanCost` = média dos `cost` definidos. Por candidato com `samples > 0`:
  `latencyBonus`/`costBonus` ∈ `[0, 4]` conforme plan §3; `score += latencyBonus + costBonus`;
  `reasons` ganha `latency:p50=<ms>` e (se custo definido) `cost:$<x>/run`; item ganha
  `evidence: { samples, medianDurationMs, meanCostUsd, successRate }` (`meanCostUsd` `null` sem custo).
  `samples === 0` → sem bônus, `evidence` com zeros/`null`. Ordenação `score desc, name asc` intacta.
- **Done**:
  - [ ] `tsc --noEmit` verde
  - [ ] teste: 2 perfis fit+sucesso idênticos, um com amostras mais rápidas → esse vem 1º; sem amostras → score de fit puro

## T3 — Fios: `llm:eval` / `llm:recommend`
- **Owner**: Worker · **Est**: P · **Depende de**: T1, T2
- **Paths**: `scripts/llm-fit.ts` (só se precisar passar algo novo — provavelmente não)
- **Escopo**: confirmar que a saída JSON de `forja llm:eval` e `forja llm:recommend` carrega os
  campos novos (os scripts já serializam o retorno inteiro). Ajustar só se houver projeção que
  descarta chaves.
- **Done**:
  - [ ] `forja llm:eval --scope model --id <x>` mostra `durationMsP50`/`P95`/`costPerAcceptedTask`
  - [ ] `forja llm:recommend --role <r> --task <t>` mostra `evidence` por item

## T4 — Documentação + CHANGELOG
- **Owner**: Worker · **Est**: P · **Depende de**: T3
- **Paths**: `docs/llm-fit-loop.md`, `docs/llm-evolution.md`, `CHANGELOG.md`
- **Escopo**: métricas novas + ponderação; **ressalva explícita**: nenhum percentual antes de um
  baseline de 30 dias. `llm-evolution.md` etapa 3 → "implementada, sem promessa numérica".
  CHANGELOG `[Unreleased]`.
- **Done**:
  - [ ] `forja tools:doctor` → `docs-commands`, `commands-documented`, `docs-links` verdes

## T5 — Testes + validação final + fecho
- **Owner**: Worker → Governance · **Est**: M · **Depende de**: T1–T4
- **Paths**: `test/llm-routing.test.js`, `test/*eval*`, novos se necessário
- **Escopo**: cobrir AC-7; ajustar `test/llm-routing.test.js` **só** nas asserções de score que
  mudam por desenho (documentar cada ajuste). Bateria; `spec.md` §Evidências; status; handoff.
- **Done**:
  - [ ] `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`, `forja project:check` verdes — AC-8
  - [ ] `spec:set-status llm-benchmark-recomendacao spec implementing` no início; handoff `review` ao fim

---

## Mapa AC → task

| AC | Tasks |
|---|---|
| AC-1 | T1 |
| AC-2 / AC-3 / AC-4 | T2 |
| AC-5 | T3 |
| AC-6 | T4 |
| AC-7 / AC-8 | T5 |

## Handoffs

SDD Architect (spec+plan+tasks) → **Worker** (T1–T4) → **Governance** (T5 + `project:check`).

## Evidências e estado real

- Nada executado.
- **De `main`** (com W10). Sem ADR. Mudança de score por desenho; chaves de saída só crescem.
