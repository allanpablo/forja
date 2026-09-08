# Plan: llm-benchmark-recomendacao

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-09-08

## 1. Abordagem técnica

Duas funções puras ganham eixos. `EvaluationEngine.metrics()` calcula 3 chaves novas
(`durationMsP50`, `durationMsP95`, `costPerAcceptedTask`) sobre as mesmas observações — nada de
novo é lido. `recommendProfile` agrega, por candidato, a mediana de `durationMs` e a média de
`cost` das amostras, aplica um ajuste **limitado** ao `score` (mais rápido/barato que a coorte →
alguns pontos) e devolve um bloco `evidence`. Tudo determinístico, sem rede. Os scripts
(`llm:eval`, `llm:recommend`) já serializam o retorno inteiro — os campos novos fluem sozinhos.

## 2. Módulos afetados

| Caminho | Mudança | Risco |
|---|---|---|
| `packages/evals/src/index.ts` | editar — `metrics()`: `percentile(durations, 50/95)` helper; `costPerAcceptedTask = totalCost / accepted` (0 se `accepted === 0`). Existentes intactas | B |
| `packages/llm/src/index.ts` | editar — `recommendProfile`: por candidato, `median(durationMs)`, `mean(cost)` das amostras; `cohortMedianLatency`/`cohortMeanCost` das amostras totais; `latencyBonus`/`costBonus` ∈ [0, 4] cada; `score += latencyBonus + costBonus`; `reasons` ganha `latency:p50=<ms>`/`cost:$<x>/run`; item ganha `evidence: { samples, medianDurationMs, meanCostUsd, successRate }` | M |
| `packages/contracts/src/index.ts` | editar **se** `EvaluationReport.metrics`/o item de `recommendProfile` forem tipos nominais — estender aditivamente | B |
| `docs/llm-fit-loop.md`, `docs/llm-evolution.md` | editar — métricas + ponderação + ressalva do baseline de 30d | B |
| `test/llm-routing.test.js`, `test/*eval*` | editar/criar — percentis; preferência barato/rápido no empate; `evidence`; sem amostras → score de fit puro | M |

## 3. Diagrama de fluxo

```
llm:eval --scope model --id p:m
   └─ EvaluationEngine.evaluate → metrics(selected):
        (existentes) successRate, reworkRate, tokensPerTask, totalCost, …
        (novas)      durationMsP50, durationMsP95, costPerAcceptedTask

llm:recommend --role r --task t
   └─ recommendProfile(profiles, observations, r, t):
        cohortMedianLatency = median(todas as durationMs com amostra)
        cohortMeanCost       = mean(todos os cost definidos)
        por candidato c com samples>0:
          medLat = median(samples.durationMs); meanCost = mean(samples.cost ?? —)
          latencyBonus = medLat  < cohortMedianLatency ? min(4, round(4·(1 - medLat/cohort))) : 0
          costBonus    = meanCost < cohortMeanCost      ? min(4, round(4·(1 - meanCost/cohort))) : 0
          score = fitScore + successBonus + min(samples,10) + latencyBonus + costBonus
          evidence = { samples, medianDurationMs: medLat, meanCostUsd: meanCost ?? null, successRate }
        sort: score desc, name asc
```

## 4. Contratos (API/CLI/Schema)

```ts
// packages/evals — metrics() acrescenta (Record<string, number>):
durationMsP50: number;        // 0 quando sem observação
durationMsP95: number;
costPerAcceptedTask: number;  // totalCost / accepted; 0 quando accepted === 0

// packages/llm — cada item de recommendProfile acrescenta:
evidence: {
  samples: number;
  medianDurationMs: number;   // 0 quando samples === 0
  meanCostUsd: number | null; // null quando nenhuma amostra tem cost
  successRate: number;
};
// reasons ganha, quando samples>0: `latency:p50=<ms>` e (se meanCost definido) `cost:$<x>/run`
```

Sem quebra: só chaves novas; `score` de candidatos **com amostras** muda por desenho.

## 5. Decisões e alternativas

**D1 — Bônus limitado a `[0,4]` por eixo, aditivo ao score.** Fit declarado vale 100+50; sucesso
até 25; presença até 10. Latência+custo somam no máximo 8 — nunca invertem um fit, só desempatam
e refinam entre pares próximos. Rejeitado: multiplicar o score por um fator de custo (fácil de
inverter tudo sem querer).

**D2 — Percentil por interpolação linear** (`p·(n-1)` → índice, mistura os dois vizinhos). Padrão,
determinístico. Rejeitado: "nearest rank" (salta em amostras pequenas).

**D3 — `costPerAcceptedTask` fica em `metrics` (number, 0-fallback); `meanCostUsd` (que pode ser
`null`) fica só no `evidence`.** `metrics` é `Record<string, number>` — `null` não cabe. "Nenhuma
tarefa aceita" e "custo real zero" ambos viram 0 em `metrics`; o `evidence` do `recommend` é onde
a distinção `null` importa e cabe.

**D4 — Coorte = todas as amostras do conjunto de observações passado**, não por role/task. É a
referência "rápido/barato comparado a quê"; filtrar por role/task reduziria a amostra a quase nada.

Sem ADR — evolui `EvaluationReport`/`recommendProfile` aditivamente; ordenação e determinismo
preservados.

## 6. Dependências

- De `main` (com W10). `Observation.cost`/`durationMs` (SPEC-028) já existem e já chegam ao
  `recommendProfile`.
- Pacotes npm: nenhum. Migrações: nenhuma.

## 7. Rollout

- [ ] Feature flag: não. Aditivo.
- [ ] Doc: `docs/llm-fit-loop.md` (§Execução e evidência / §recommend), `docs/llm-evolution.md`
      (etapa 3 → "implementada"), com a ressalva do baseline.
- [ ] `CHANGELOG.md` `[Unreleased]`: Adicionado (`llm:eval` p50/p95 + custo/tarefa; `llm:recommend`
      pondera custo/latência + `evidence`).

## 8. Sinais de fracasso (kill criteria)

- O ajuste de bônus muda demais o `llm:routing.test.js` (mais que 1–2 asserções) → reduzir o teto
  para `[0,2]` por eixo ou tornar o bônus só um `reasons`/`evidence`, sem tocar o `score`.
- `EvaluationReport.metrics` tipado impede as chaves novas sem uma mudança de contrato grande →
  entregar só `recommendProfile` nesta rodada e `llm:eval` numa spec própria.

## Evidências e estado real

| AC | Task | Verificação |
|---|---|---|
| AC-1 | T1 | `metrics()` com fixtures de duração → p50/p95 corretos; `costPerAcceptedTask` |
| AC-2/AC-3/AC-4 | T2 | `recommendProfile` — bônus limitado, `evidence`, ordem estável, empate → barato/rápido |
| AC-5 | T3 | saída de `llm:eval`/`llm:recommend` com os campos novos |
| AC-6 | T4 | docs + ressalva do baseline |
| AC-7 | T5 | testes |
| AC-8 | T5 | bateria; `llm-routing` ajustado ao mínimo |

- **Mudança de score, não de contrato.** As métricas existentes não mudam para os mesmos dados.
- **Nada de percentual prometido** antes do baseline de 30d.
