# Spec: orchestration-coherent

- **ID**: SPEC-019
- **Status**: done
- **Owner**: apk
- **ADRs relacionadas**: ADR-0021 (invariante > disciplina), ADR-0025 (coerência da doc — a mesma classe), ADR-0005 (handoff 7 campos), ADR-0020 (core/registry)

## 1. Problema

O nome do repositório é **orquestração multiagente** — e é a parte **menos harnessed** do framework.
A topologia de quem-orquestra-quem é descrita em **três lugares independentes**, e nada garante que
concordem:

1. `AGENTS.md` — a prosa: os papéis e a topologia.
2. `scripts/agent-router.ts` (`VALID_AGENTS`) — o código: para quem um handoff pode ser roteado.
3. `.claude/agents/*.md` — os sub-agents executáveis: quem, de fato, faz o trabalho.

Três descrições da mesma coisa divergem em silêncio. **E já divergem hoje** (medido antes de escrever
esta spec — a mesma prova que o `adr-refs` deu):

- **`worker`** está no `VALID_AGENTS` e no `AGENTS.md`, mas **não tem** `.claude/agent`. Um papel que
  recebe handoff sem definição executável — prosa que o código não implementa.
- **`release-auditor`** é um sub-agent executável, mas **não está** no `VALID_AGENTS`. Um agente para
  o qual o router não consegue rotear — implementação que a orquestração não alcança.
- **`architect`** (AGENTS.md) vs **`sdd-architect`** (router/agents) — o mesmo papel com dois nomes.

Pelo critério do ADR-0021, isto não é orquestração: é sugestão. A topologia vive por disciplina, e
está silenciosamente incoerente **agora**. Não é conhecimento que falta — é execução.

## 2. Proposta de valor

A topologia de agentes deixa de poder divergir em silêncio: **as três fontes de verdade
(AGENTS.md ↔ router ↔ .claude/agents) são conferidas por um gate**. Um papel sem agente executável,
um agente sem rota, um nome divergente — tudo reprova. A orquestração descrita passa a ser a
orquestração implementada.

## 3. User stories

- **Como** mantenedor, **quero** que um papel citado na topologia sem sub-agent executável **reprove**,
  **para que** a orquestração não prometa um agente que não existe.
- **Como** mantenedor, **quero** que um sub-agent para o qual o router não roteia seja apontado,
  **para que** eu não tenha implementação órfã que a orquestração nunca aciona.
- **Como** governança, **quero** rodar isso no `tools:doctor`, **para que** a coerência da topologia
  seja um artefato verificável, não uma afirmação no README.

## 4. Critérios de aceite (Definition of Done)

- [ ] AC-1: Um check `agent-topology` (no catálogo do `tools:doctor`, via runner de `checks.ts`)
      cruza as três fontes e **reprova** (ou avisa) quando divergem:
  - papel roteável (`VALID_AGENTS`, menos `user`) **sem** `.claude/agents/<papel>.md` → o router
    promete um destino que não tem executor;
  - `.claude/agents/<x>.md` que **não** está em `VALID_AGENTS` → agente executável que ninguém roteia;
  - papel citado no `AGENTS.md` que não bate com nenhuma das outras fontes → prosa órfã.
- [ ] AC-2: `user` é reconhecido como destino válido de handoff **sem** exigir um agent (é o humano —
    não tem `.claude/agent`, e tudo bem).
- [ ] AC-3: O check roda no `tools:doctor` e reporta as divergências reais que já existem hoje
    (`worker`, `release-auditor`, `architect`/`sdd-architect`) — a prova de que a fronteira estava
    descoberta.
- [ ] AC-4: Fechada a incoerência: cada divergência resolvida (criar o agent, ajustar o router, ou
    alinhar o nome) até o check ficar verde — decidido caso a caso, não no atacado.
- [ ] AC-5: Lógica pura e testável (extrai a topologia de fontes injetáveis; testes com fixtures).

## 5. Escopo

**Dentro**: conferir a **coerência estrutural** da topologia — os nomes de papéis/agentes batem entre
as três fontes.

**Fora** (explícito — a fronteira honesta):
- **Rodar os agentes de IA autonomamente.** O framework não executa um loop de IA; quem aciona os
  sub-agents é o Claude Code, no uso. Este gate prova que a topologia é *coerente e acionável*, não
  que a IA fez um bom trabalho. "Provar que a orquestração produz bom output" não é harness — é
  julgamento, e fica fora.
- Validar o *conteúdo* de cada `.claude/agent` (o prompt está bom?) — é qualidade, não topologia.
- Um motor de execução de handoffs em cadeia (state machine que dirige o fluxo) — pode ser SPEC
  futura; esta fecha a **coerência**, o pré-requisito de qualquer execução.

## 6. NFRs / restrições

- **Compatibilidade**: só lê as três fontes; não muda o comportamento do router nem dos agents.
- **Severidade honesta**: divergência que quebra a orquestração (papel roteável sem executor) =
  provável `critical`/`warn` a decidir no plan; nome divergente = `warn`. A calibração fica para o
  plan, à luz do que as divergências reais pedem.

## 7. Riscos e mitigação

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| O check vira ruído (muitos avisos aceitáveis) | M | M | severidade calibrada no plan; `user` e casos legítimos isentos (AC-2) |
| Alinhar os nomes quebra referências em prosa | B | M | AC-4 resolve caso a caso, com o gate confirmando cada passo |

## 8. Métricas de sucesso

As três divergências de hoje (`worker`, `release-auditor`, `architect`/`sdd-architect`) resolvidas, o
`agent-topology` verde no `tools:doctor`, e uma futura divergência (um agent novo sem rota, um papel
renomeado) pega pelo gate antes do merge. A orquestração descrita = a orquestração implementada.
