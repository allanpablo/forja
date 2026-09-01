# Spec: Smart Agent Routing

- **ID**: SPEC-037
- **Status**: done
- **Owner**: apk
- **Criado em**: 2026-09-01
- **Sprint alvo**: Sprint 5 (segundo sprint da Fase 3 — a peça deixada de fora de SPEC-036 §5
  deliberadamente: "consumo depende deste sprint já estar em produção")
- **ADRs relacionadas**: ADR-0078; depende de SPEC-036 (`AgentProfile2`/`trustLevel` — a fonte de
  reputação que esta spec consome, não recalcula)

> Não confundir com `packages/llm.recommendProfile` (ADR-0074, "LLM Fit Loop") — aquele roteia
> entre **perfis de provider/model** (`codex`/`claude`/`gemini`/`ollama`) por papel/tarefa; esta
> spec roteia entre **agentes registrados** (`AgentProfile2`, SPEC-036) por papel/domínio/reputação.
> São dois problemas adjacentes, não o mesmo — por isso esta spec **estende
> `packages/engineering/identity`** (onde `AgentProfile2`/`computeReputationScore` já vivem), não
> `packages/llm`. O gap analysis original (`docs/architecture/...` §3) que sugeriu "estender
> `llm-fit`" previa isso antes de `AgentProfile2` existir; agora que existe, estender o pacote que
> já tem o dado é a composição certa, não duplicar o dado em `packages/llm`.

## 1. Problema

`AgentProfile2` (SPEC-036) já tem `trustLevel`/`autonomyLevel` reais, derivados de comportamento —
mas nada usa esse dado pra recomendar **qual agente registrado** é o mais adequado pra um
papel/domínio. Hoje a escolha de agente é manual e não considera histórico de confiabilidade.

## 2. Proposta de valor

`forja agent:recommend --role <role> [--domain <d>]` classifica os agentes já registrados por
adequação (papel, domínio de arquitetura, reputação), com razões explícitas — nunca um ranking sem
explicação, mesmo princípio já usado em `risk:assess`/`architecture:check`.

## 3. User stories

- **Como** governance/orchestrator, **quero** uma recomendação de qual agente registrado atribuir a
  uma tarefa de um papel/domínio específico, **para que** a escolha considere reputação real, não
  só disponibilidade.

## 4. Critérios de aceite (Definition of Done)

- [x] AC-1: `recommendAgent` (função pura, `packages/engineering/identity`, mesmo pacote de
      `computeReputationScore` — SPEC-036) recebe `readonly AgentProfile2[]` + critério
      (`role`, `domain?`) e devolve um ranking com `score` e `reasons[]` — nunca um número sem
      explicação (mesmo padrão de `recommendProfile`/`risk:assess`).
- [x] AC-2: agente sem `trustLevel` ainda (nunca rodou `agent:score`) ainda aparece no ranking —
      não é excluído, mas o motivo declara explicitamente "sem pontuação ainda", nunca finge um
      trust level que não existe.
- [x] AC-3: `forja agent:recommend --role <role> [--domain <d>]` (novo subcomando de
      `scripts/agent.ts` — mesmo domínio de comando de SPEC-036, não um script novo) funcional.
- [x] AC-4: recomendação é **informação**, não decisão — não bloqueia, não atribui, não chama
      `PolicyEngine`/`RuntimeEngine`. Mesmo princípio de `RiskEngine`/SPEC-034 D3: o score informa,
      quem decide continua sendo o humano/orquestrador.

## 5. Escopo

**Dentro**: `recommendAgent` (motor puro); `agent:recommend` (CLI).

**Fora**: atribuição automática de agente a uma tarefa (decisão continua manual/orquestrador, AC-4);
routing entre provider/model (`packages/llm.recommendProfile` já existe e não muda aqui);
`PolicyEngine` consumir a recomendação automaticamente (mesmo raciocínio de SPEC-034/036 — consumo
é spec própria futura, quando/se fizer sentido).

## 6. NFRs / restrições

- Determinístico, sem LLM — mesma fórmula de scoring documentada em código e aqui.
- Reaproveita `AgentProfile2`/`trustLevel` já persistido — nenhum cálculo de reputação novo (isso é
  SPEC-036, não esta spec).

## 7. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Confundir com `llm:recommend` (routing de provider/model) | Média (nomes parecidos) | Baixa (confusão, não bug) | Nota explícita no topo desta spec e no código; comandos com prefixos diferentes (`agent:` vs. `llm:`) |
| Ranking virar decisão automática por acidente | Baixa (mesmo padrão já seguido em RiskEngine) | Alta se acontecesse | AC-4 explícito; nenhum código nesta spec chama `PolicyEngine`/atribui trabalho |

## 8. Métricas de sucesso

Registrar 2+ agentes com `role`/`architectureDomains`/`trustLevel` diferentes (reaproveitando os
dados de teste de SPEC-036) e confirmar que `agent:recommend` ordena corretamente por adequação —
revisão humana, mesma metodologia de SPEC-034/036 §8.

**Validado** (`test/agent-cli.test.js`): 3 agentes registrados — `agent-a` (role+domain casados,
mais reputação real via amostra sintética de SPEC-036: 4 sucessos/1 rollback), `agent-b` (só role),
`agent-c` (só domain). Ranking saiu `agent-a > agent-b > agent-c`, na ordem esperada por revisão
humana — nenhum redesenho de pesos necessário (kill criteria do plan não disparado).
