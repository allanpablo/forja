# ADR-0077: orçamento de autonomia por custo real (maxCostUsd)

- **Status**: accepted
- **Data**: 2026-09-01
- **Autor(es)**: apk
- **Tags**: policy, cost, observability, cli, llm

## Contexto

`PolicyLimits` (`maxTokens`, `maxFiles`, `maxDurationMs`, `maxRetries`) ganhou enforcement real em
`CapabilityRegistry.checkLimits` na auditoria de segurança de 2026-08-31 (ADR-0074 cita o contexto do
LLM Fit Loop que motiva isso). Nenhum desses limites fala em dinheiro: um profile `codex:default` e um
`claude:opus` podem gastar o mesmo número de tokens e custar ordens de magnitude diferentes. Quem opera
múltiplos produtos/clientes ao mesmo tempo (o usuário principal do Forja) só descobre o estouro de
custo na fatura do provider — depois do fato. Ver SPEC-029 para o problema completo, ACs e riscos.

Duas perguntas estruturais tinham que ser respondidas antes de codificar:

1. Onde mora o cálculo de custo, dado que `packages/core`/`policy`/`contracts` não podem importar uma
   tabela de preço específica de provider (ver `docs/architecture/FORJA-2.0-ARCHITECTURE.md`, "Direção
   de dependência" — domain core não conhece adapters)?
2. O que fazer quando o provider/modelo de uma execução não está na tabela de preço local?

## Decisão

**Cálculo de custo fica fora do domain core.** `CapabilityExecutionRequest` (packages/core) ganha um
campo opcional `estimatedCostUsd?: number`, calculado pelo CHAMADOR (o script/adapter que já sabe qual
modelo está em jogo) e só comparado contra `PolicyLimits.maxCostUsd` em `checkLimits` — o mesmo padrão
já usado para `budget.totalTokens` vs. `maxTokens`. `packages/core` nunca importa `lib/core/model-pricing.ts`
nem sabe o que é um "provider".

**Preço desconhecido é fail-open, e só para custo.** Quando o chamador não tem preço para o
provider/modelo (`estimatedCostUsd` ausente), `checkLimits` NÃO aplica `maxCostUsd` para aquela
chamada — a execução segue. Isto é uma exceção deliberada ao princípio "autonomia supervisionada por
padrão" que rege o resto do framework (onde a ausência de informação tende a bloquear, não liberar).
A justificativa: uma tabela de preço desatualizada ou incompleta é um problema de MANUTENÇÃO da tabela,
não um sinal de que o trabalho é ilegítimo — bloquear trabalho legítimo por um gap de catalogação é
pior que reportar um custo impreciso. O aviso (não o bloqueio) é o instrumento certo aqui: `forja
llm:doctor` reporta `pricing.known`/`pricing.stale` por profile, e `forja llm:run` avisa em stderr
quando grava uma observação sem custo computado.

**Tabela de preço local, versionada, com `asOf` por entrada.** `lib/core/model-pricing.json` +
`lib/core/model-pricing.ts` (loader/validador/calculadora puros, só fs — sem rede). Cada entrada carrega
`asOf`; `isPriceStale` (> 90 dias) alimenta o aviso de `llm:doctor` — mitigação direta do risco "tabela
desatualizada" do SPEC-029.

**Relatório é comando novo (`cost:economy`), não seção em `token:economy`.** `token:economy` mede
CENÁRIOS SINTÉTICOS de fixture (clean vs. flat, memória quente vs. fria) — nunca rodou um LLM de
verdade. `cost:economy` agrega OBSERVAÇÕES REAIS do `ObservationStore` (o mesmo que `llm:eval` usa),
multiplicadas pela tabela de preço. Misturar os dois faria "economia de token" parecer "economia de
custo" sobre números que nunca geraram custo real.

## Alternativas consideradas

- **`packages/policy` importa a tabela de preço diretamente**: rejeitada — viola a direção de
  dependência (domain core conhecendo pricing de provider, um detalhe de adapter).
- **Preço desconhecido bloqueia (fail-closed, como o resto do framework)**: rejeitada — transformaria
  todo gap de manutenção da tabela em um incidente de produção, para um dado que é explicitamente
  local/estático/não-sincronizado (ver "Fora" do SPEC-029). Documentado aqui como a ÚNICA exceção
  deliberada ao fail-closed padrão, para não ser lida como inconsistência.
- **Estender `token:economy` in-place com uma seção de custo**: rejeitada — os dois eixos medem coisas
  diferentes (fixture sintética vs. observação real); um comando irmão mantém a distinção honesta.
- **`Observation` ganha `projectId` para permitir "custo por projeto" literal**: adiada — cada projeto
  já opera seu próprio workspace/DB (`FORJA_WORKSPACE`), então rodar `cost:economy` dentro do workspace
  de um projeto já escopa o relatório a ele. Um campo `projectId` explícito em `Observation` é uma
  mudança de contrato maior que o SPEC-029 não pede; fica para spec própria se a separação por
  workspace se mostrar insuficiente.

## Consequências

**Positivas**:
- `maxCostUsd` é opcional em todo lugar — regras de política existentes continuam funcionando sem
  qualquer mudança (compatibilidade, NFR do SPEC-029).
- Nenhum pacote do domain core passa a conhecer preços de provider; a tabela pode mudar sem tocar
  `packages/policy` ou `packages/core`.
- `llm:doctor` e `llm:run` já avisam sobre gaps de preço antes que virem surpresa de fatura.

**Negativas / Trade-offs**:
- Enforcement de `maxCostUsd` só é efetivo quando o CHAMADOR calcula e passa `estimatedCostUsd` —
  capabilities que não passam por essa plumbing (a maioria dos comandos legados do CLI, que ainda não
  passam por `CapabilityRegistry.execute`) não têm o limite aplicado automaticamente.
- "Preço desconhecido não bloqueia" significa que um `maxCostUsd` agressivo pode ser silenciosamente
  ineficaz contra um provider fora da tabela — mitigado pelo aviso, não pelo bloqueio.
- `cost:economy` reporta por modelo, não por domínio/projeto explícito dentro de um mesmo workspace
  (ver alternativa adiada acima).

## Rastreamento

- Implementação: `packages/policy/src/index.ts`, `packages/core/src/index.ts`,
  `lib/core/model-pricing.ts`, `lib/core/model-pricing.json`, `scripts/llm-fit.ts`,
  `scripts/cost-economy.ts`, `lib/core/registry.ts`
- Testes: `test/policy.test.js`, `test/policy-registry.integration.test.js`,
  `test/model-pricing.test.js`, `test/cost-economy.test.js`
- Spec: `specs/cost-aware-autonomy-budget/spec.md` (SPEC-029)
- ADRs relacionadas: ADR-0074 (LLM Fit Loop / adapters de CLI)
