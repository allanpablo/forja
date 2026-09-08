# Spec: llm-benchmark-recomendacao — `llm:eval` com latência/custo e `llm:recommend` multi-eixo

- **ID**: SPEC-049
- **Status**: implementing
- **Owner**: apk
- **Criado em**: 2026-09-08
- **Sprint alvo**: <a definir>
- **ADRs relacionadas**: nenhuma — evolui os contratos de `EvaluationReport` (SPEC-028) e
  `recommendProfile` (SPEC-028) de forma **aditiva**; sem decisão estrutural.
- **Origem**: `docs/roadmap-v4.1.md`, Onda 4 (W11) — etapa 3 do `docs/llm-evolution.md`. Fecha C4.

## 1. Problema

**C4 — `llm:recommend` não pondera custo nem latência.** O score de `recommendProfile` hoje é
`role*100 + taskType*50 + successRate*25 + min(samples,10)`. Ele **recebe** `cost` e `durationMs`
nas observações e **não usa nenhum dos dois**. Um perfil caro e lento com o mesmo fit declarado
que um barato e rápido recebe a mesma recomendação. `cost:economy` mede o custo acumulado, mas
isolado do roteamento.

**`llm:eval` não expõe latência por percentil nem custo por tarefa aprovada.** `EvaluationReport`
já tem `successRate`, `reworkRate`, `tokensPerTask`, `totalCost` — mas não `p50`/`p95` de duração
nem `totalCost / tarefas aceitas`, que são o que decide "vale a pena este modelo?".

**Como medimos hoje**: `recommendProfile` não referencia `cost`/`durationMs`; `metrics()` de
`EvaluationEngine` não tem chave de percentil.

## 2. Proposta de valor

`llm:eval` passa a reportar `durationMsP50`/`durationMsP95` e `costPerAcceptedTask`. `llm:recommend`
pondera **custo e latência** além do fit declarado e da taxa de sucesso, e devolve a **evidência
por candidato** (amostras, mediana de duração, custo médio, taxa de sucesso) — a recomendação
deixa de ser opaca. Nenhum percentual de ganho é prometido antes de um baseline de 30 dias.

## 3. User stories

- **Como** operador escolhendo um perfil, **quero** que `llm:recommend` prefira o mais barato e
  rápido quando o fit e o sucesso empatam, **para que** o roteamento não me custe mais do que
  precisa.
- **Como** operador, **quero** ver *por que* um perfil foi recomendado (não só o score), **para
  que** eu confie ou conteste a escolha.
- **Como** quem avalia um modelo, **quero** `llm:eval` com p50/p95 de latência e custo por tarefa
  aprovada, **para que** eu compare modelos pelo que importa, não só pela taxa de sucesso.

## 4. Critérios de aceite (Definition of Done)

- [ ] **AC-1**: `EvaluationEngine.metrics()` ganha `durationMsP50`, `durationMsP95` (percentis da
      `durationMs` das observações do escopo; 0 quando não há observação) e `costPerAcceptedTask`
      (`totalCost / nº de observações com validationStatus 'accepted'`; 0 quando nenhuma aceita).
      As métricas existentes são **inalteradas**.
- [ ] **AC-2**: `recommendProfile` passa a incluir no `score`, para cada candidato com amostras,
      um ajuste por **latência** (mais rápido que a mediana da coorte → bônus) e por **custo**
      (mais barato que a média da coorte → bônus), **limitado** para que fit declarado
      (`role`/`taskType`) continue dominando. Sem amostras → sem ajuste (score de fit puro).
- [ ] **AC-3**: cada item de `recommendProfile` ganha `evidence: { samples, medianDurationMs,
      meanCostUsd, successRate }` (números; `meanCostUsd` é `null` quando nenhuma amostra tem
      custo). O `reasons` ganha `latency:p50=<ms>` e `cost:$<x>/run` quando há evidência.
- [ ] **AC-4**: a ordenação de `recommendProfile` continua `score desc, name asc` — determinística.
      Dois perfis de fit idêntico e amostras: o de menor mediana de latência (ou menor custo, se a
      latência empata) vem antes.
- [ ] **AC-5**: `forja llm:eval` e `forja llm:recommend` emitem os campos novos na saída JSON sem
      quebrar as chaves existentes (consumidores antigos ignoram o que não conhecem).
- [ ] **AC-6**: `docs/llm-fit-loop.md` e `docs/llm-evolution.md` documentam as métricas novas e a
      ponderação, **com a ressalva explícita**: nenhum percentual de melhoria é afirmado antes de
      coletar um baseline de 30 dias (o roadmap e o `llm-evolution.md` já exigem isso).
- [ ] **AC-7**: testes — percentis de `metrics()` (com fixtures de duração conhecida);
      `recommendProfile` prefere o candidato barato/rápido quando fit e sucesso empatam; `evidence`
      presente e correta; sem amostras → score de fit puro (comportamento atual preservado).
- [ ] **AC-8**: `tsc --noEmit`, `node --test test/*.test.js`, `forja spec:check`,
      `forja project:check` verdes. `test/llm-routing.test.js` e os testes de `EvaluationEngine`
      passam com ajuste **mínimo** (só onde o score muda por desenho).

## 5. Escopo

**Dentro**:
- `packages/evals/src/index.ts` — `durationMsP50`/`P95`, `costPerAcceptedTask` em `metrics()`.
- `packages/llm/src/index.ts` — ponderação custo/latência + `evidence` em `recommendProfile`.
- `packages/contracts/src/index.ts` — se `EvaluationReport.metrics`/o retorno de `recommendProfile`
  forem tipados nominalmente, estender o tipo (aditivo).
- `docs/llm-fit-loop.md`, `docs/llm-evolution.md`; testes.

**Fora** (evita scope creep):
- Eixo de **qualidade** por avaliador LLM ("LLM-as-judge") — fica com `validationSuccessRate`
  (checks independentes) como proxy de qualidade nesta rodada.
- Eixo de **risco** por perfil — `risk:assess` é sobre um diff, não sobre um modelo; ligar os dois
  é outra spec.
- Failover automático ou escolha implícita — `llm:recommend` continua informando, o operador
  escolhe (ADR-0081).
- Reponderação configurável (pesos por `.forjarc`) — pesos fixos e documentados nesta rodada.
- Alimentar `cost:economy` de volta no `recommend` como fonte separada — as observações já
  carregam `cost`; usa isso.

## 6. NFRs / restrições

- **Compatibilidade**: saída JSON de `llm:eval`/`llm:recommend` só **ganha** chaves. Score muda
  por desenho (é o ponto); `test/llm-routing.test.js` ajusta o mínimo.
- **Determinismo**: percentis por interpolação linear fixa; ordenação estável.
- **Sem rede, sem modelo**: tudo é agregação sobre observações locais.
- **Honestidade de métrica**: `costPerAcceptedTask` = 0 quando não há aceita (não `null` nem
  `Infinity`); `meanCostUsd` = `null` quando nenhuma amostra tem custo (distinto de "custo zero").

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Bônus de custo/latência grande demais e inverte um fit declarado | M | A | Ajuste **limitado** (AC-2) — no máximo alguns pontos, nunca mais que `min(samples,10)`; teste garante que fit ganha |
| Poucas amostras → mediana/custo enganosos | M | M | Ajuste só com `samples > 0`; `evidence.samples` sempre exposto para o operador ponderar |
| Consumidor do JSON quebra com chave nova | B | B | Só adição; documentado; consumidores conhecidos são internos |
| `EvaluationReport.metrics` é `Record<string, number>` e `null` não cabe | M | M | `costPerAcceptedTask` fica em `metrics` (number, 0-fallback); `meanCostUsd` (que pode ser null) fica só no `evidence` de `recommendProfile`, que é objeto livre |

## 8. Métricas de sucesso

**Baseline primeiro** — o `llm-evolution.md` já exige coletar 30 dias antes de prometer números.

- Em 30 dias, com observações reais: `llm:recommend` para um par (role, task) com histórico
  recomenda o perfil de menor `costPerAcceptedTask` quando o fit e o `validationSuccessRate` empatam.
- `llm:eval --scope model` mostra `durationMsP50`/`P95` e `costPerAcceptedTask` para cada modelo com
  observações.
- Zero regressão nas métricas existentes (mesmos valores para os mesmos dados).

## Evidências e estado real

- AC-1 a AC-8 → tasks em `spec:tasks`.
- **Mudança de score, não de contrato**: `recommendProfile` muda o `score` de candidatos com
  amostras (por desenho); as chaves de saída só crescem.
- **Hipótese, não medição**: os ganhos de §8 dependem de observações reais acumuladas; nada é
  afirmado antes do baseline.
- **Dependência**: de `main` (que já tem W10). Usa `Observation.cost`/`durationMs` (SPEC-028) e
  `cost:economy`/`model-pricing` só como referência conceitual.
