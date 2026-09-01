# Spec: orçamento de autonomia por custo real (cost-aware autonomy budget)

- **ID**: SPEC-029
- **Status**: draft
- **Owner**: apk
- **Criado em**: 2026-08-31
- **Sprint alvo**: <a definir>
- **ADRs relacionadas**: ADR-0074 (LLM Fit Loop / adapters de CLI) — este spec estende `PolicyLimits`, que acabou de ganhar enforcement real em `CapabilityRegistry.execute` (auditoria de segurança 2026-08-31)

## 1. Problema

`token:economy` **mede e prova** economia de tokens (~40-60% vs. exploração fria), e o LLM Fit Loop já
roteia entre múltiplos providers por papel/tarefa. Mas nenhum dos dois fala a língua que realmente
importa pra quem paga a conta: **dinheiro**. Um profile `codex:default` e um `claude:opus` podem gastar
o mesmo número de tokens e custar ordens de magnitude diferentes. `PolicyLimits` (`maxTokens`,
`maxFiles`, `maxDurationMs`, `maxRetries`) não tem noção de custo — uma regra de política não consegue
dizer "esta categoria de trabalho não pode passar de $2 por execução", mesmo que consiga dizer "não
pode passar de 5000 tokens". Para quem opera múltiplos produtos/clientes ao mesmo tempo (o usuário
principal do Forja, por definição do próprio README), isso significa descobrir o estouro de custo só
na fatura do provider — depois do fato, não antes.

## 2. Proposta de valor

Toda decisão de política pode declarar um teto de custo real em dólares (`maxCostUsd`), aplicado no
mesmo ponto onde `maxFiles`/`maxTokens` já são aplicados. `token:economy` ganha uma dimensão de custo
real (`cost:economy`), calculada a partir de uma tabela de preço por provider — local, versionada no
repo, sem chamada de rede. **"Economia de tokens" vira "economia de custo"**, mensurável e limitável.

## 3. User stories

- **Como** consultor rodando produtos de múltiplos clientes ao mesmo tempo, **quero** definir um teto
  de gasto por sprint ou por categoria de risco, **para que** um agente autônomo não estoure orçamento
  usando um provider caro sem eu perceber até tarde.
- **Como** dono de um projeto pequeno, **quero** ver quanto cada sprint custou de verdade (não só em
  tokens), **para que** eu decida racionalmente qual provider vale o custo pra qual tipo de tarefa.
- **Como** governance, **quero** que uma execução seja bloqueada (não só logada) quando ultrapassa o
  teto de custo, **para que** o limite seja um freio real, não uma métrica de retrovisor.

## 4. Critérios de aceite (Definition of Done)

- [ ] AC-1: `PolicyLimits` ganha `maxCostUsd?: number`; uma regra `ALLOW_WITH_LIMITS` pode declará-lo.
- [ ] AC-2: `CapabilityRegistry.execute` (função `checkLimits`, já existente) recusa a chamada com
      `POLICY_LIMIT_EXCEEDED` quando o custo projetado da execução ultrapassa `maxCostUsd` — mesmo
      padrão hoje usado para `maxFiles`/`maxTokens`.
- [ ] AC-3: existe uma tabela de preço por provider/modelo (`$/1K tokens` input e output, separados),
      versionada em arquivo próprio (ex.: `lib/core/model-pricing.json`), carregada localmente — sem
      rede.
- [ ] AC-4: quando o provider/modelo de uma execução não está na tabela de preço, a execução **não é
      bloqueada** (fail-open para o enforcement de custo especificamente — divergente do resto do
      framework, e por isso citado explicitamente aqui): ela prossegue e um aviso é registrado
      (`llm:doctor` ou log estruturado) pedindo para a tabela ser atualizada. Preço desconhecido não
      pode virar bloqueio de trabalho legítimo.
- [ ] AC-5: `forja token:economy` passa a reportar também custo real acumulado por domínio/projeto
      (`cost:economy` como comando novo, ou uma seção nova em `token:economy` — decisão de UX no plan).
- [ ] AC-6: `RuntimeMetrics` (ou `Observation`, que já tem um campo `cost?: number`) passa a ser
      populado com o custo real calculado, não deixado `undefined`.

## 5. Escopo

**Dentro**:
- Extensão de `PolicyLimits`/`PolicyDecision.limits` com `maxCostUsd`.
- Enforcement em `CapabilityRegistry.checkLimits`.
- Tabela de preço local, estática, versionada.
- Cálculo de custo real a partir de tokens de entrada/saída já capturados em `Observation`.
- Relatório de custo no CLI (`token:economy` estendido ou `cost:economy` novo).

**Fora** (explícito, evita scope creep):
- Integração com billing/API de faturamento real dos providers (Anthropic, OpenAI, etc.) — a tabela é
  estática e mantida manualmente/por PR, não sincronizada automaticamente.
- Orçamento preditivo ("quanto vai custar antes de rodar") — este spec é sobre limitar e reportar
  custo real medido, não estimar custo futuro.
- Alertas proativos (Slack, e-mail) — fica para uma spec de notificação, se algum dia existir.

## 6. NFRs / restrições

- **Local-first**: nenhuma chamada de rede para obter preço — a tabela vive no repo.
- **Fail-open por design em um ponto específico**: preço desconhecido não bloqueia (ver AC-4) — é a
  única exceção deliberada ao princípio "autonomia supervisionada por padrão"; deve ficar documentada
  como tal na ADR que resultar deste spec, para não ser lida como inconsistência.
- **Compatibilidade**: `maxCostUsd` é opcional em todo lugar — regras de política existentes sem esse
  campo continuam funcionando exatamente como hoje.

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Tabela de preço desatualizada (provider muda preço) | Alta (preços de LLM mudam com frequência) | Média — custo reportado fica impreciso, não custo real cobrado | Preço tem campo `asOf` (data); `llm:doctor` avisa quando `asOf` está velho demais (ex. > 90 dias) |
| Confundir "custo estimado" com "custo real cobrado" | Média | Média — decisão de negócio baseada em número errado | Nomear explicitamente nos relatórios ("estimativa baseada em tabela local, não fatura") |
| Escopo crescer para virar um mini sistema de billing | Média | Alta (vira outro projeto) | Este spec para deliberadamente no cálculo local — qualquer integração com billing real vira spec própria |

## 8. Métricas de sucesso

30 dias após o release: um usuário consegue responder "quanto cada projeto/sprint custou de verdade
em dólares" sem sair do Forja e sem abrir o painel de billing de nenhum provider — e pelo menos uma
execução real foi bloqueada (ou teria sido, em modo relatório) por estourar `maxCostUsd` antes de gerar
uma surpresa na fatura.
