# Spec: orchestrate — o motor de orquestração (exploratória, 2.0)

- **ID**: SPEC-021
- **Status**: done
- **Owner**: apk
- **ADRs relacionadas**: ADR-0005 (handoff 7 campos), ADR-0019 (workspace), ADR-0020 (core/registry), SPEC-019 (topologia coerente), ADR-0023/0024/0029 (os gates), ADR-0009 (memória)

> **Exploratória.** O objetivo desta spec não é fechar o escopo — é tornar o conceito concreto o
> bastante para decidir o formato, e expor as decisões duras antes de virar plano. As perguntas
> abertas da §8 são o coração; as respostas remodelam o resto.

## 1. Problema

O nome do framework é **orquestração multiagente**. A SPEC-019 provou que a topologia é *coerente* —
mas orquestração coerente não é orquestração que **acontece**. Hoje um fluxo multi-papel (product →
architect → worker → governance) vive em três lugares soltos: a prosa do `AGENTS.md`, os handoffs
avulsos do `agent-router` (cada um independente, sem noção de cadeia), e a disciplina de quem lembra
de rodar `spec:check` entre uma etapa e outra. **Não existe uma cadeia que roda, gate a gate.** O
namesake é a última grande superfície que ainda vive por disciplina.

## 2. A tensão central (a decisão que organiza tudo)

**O framework não roda IA autonomamente.** Ele não pode "chamar o Claude e mandar implementar". Quem
executa o *trabalho* de cada papel é um agente de IA (sub-agent do Claude Code) ou um humano.

Então "orquestração que executa" **não** pode significar "o framework faz o trabalho". Significa:

> O framework é a **máquina de estados da cadeia de handoffs**, com **transições guardadas por
> gates**. Ele decompõe o objetivo, abre o handoff certo, roda o gate quando a etapa fecha, e — se o
> gate passa — abre a próxima; se falha, trava com o parecer. O *trabalho* dentro de cada etapa é de
> quem pega o handoff. **O framework orquestra e guarda; o agente executa.**

Isto é honesto (não finge autonomia de IA) e ainda assim é um motor de execução real: a cadeia
progride dirigida por **veredito de gate**, não por memória. É o pipeline SDD/GSD virado máquina.

## 3. Proposta de valor

Um objetivo vira uma **cadeia auditável e guardada**: cada etapa só abre quando a anterior passou no
seu gate. A pergunta "o processo foi seguido?" deixa de ser uma promessa e vira o estado de uma
máquina — e a governança do Forja chega ao próprio ato de orquestrar.

## 4. Formato proposto (v1 — a discutir)

```bash
forja orchestrate "adicionar pagamento pix" --slug pagamentos-pix
#   → decompõe numa cadeia de handoffs (o runbook), abre a 1ª etapa

forja orchestrate:status pagamentos-pix
#   → o estado da máquina: etapa aberta, feitas, bloqueadas, último veredito de gate

forja orchestrate:advance pagamentos-pix
#   → o dono da etapa atual fez o trabalho; roda o GATE da etapa;
#     verde → fecha o handoff + abre o próximo; vermelho → trava com o parecer
```

**A cadeia (v1, determinística — o pipeline SDD/GSD):**

| # | Papel | Etapa | Gate da transição |
|---|---|---|---|
| 1 | product | `spec` | `spec:check` (spec aprovada) |
| 2 | sdd-architect | `plan` | `spec:check` (plan aprovado) |
| 3 | sdd-architect | `tasks` | `spec:check` (tasks aprovado) |
| 4 | worker | `implement` | `project:check` / `code:check` |
| 5 | governance | `review` | `check:all` |

Cada transição é um handoff ADR-0005 (7 campos) gravado pelo `agent-router`, e cada `advance` é uma
linha na trilha de auditoria. A topologia coerente da SPEC-019 é o grafo que a máquina percorre.

## 5. Escopo

**Dentro (v1)**:
- A máquina de estados da cadeia (decompor → abrir → gate → avançar/travar), sobre o `agent-router`.
- Gates como transições: a etapa não avança sem o gate verde.
- `orchestrate` / `orchestrate:status` / `orchestrate:advance` no registry; tudo auditado.

**Fora (explícito — a fronteira honesta)**:
- **Rodar a IA que faz o trabalho de cada etapa.** Isso é o Claude Code (ou o humano) que pega o
  handoff aberto. O framework abre a etapa e a guarda; não a executa.
- **Decomposição por LLM.** v1 usa a cadeia determinística do SDD/GSD — provável e auditável. Um
  planejador de IA que monta cadeias sob medida é evolução, não a base.
- Paralelismo / cadeias ramificadas — v1 é linear. Ramos e fan-out ficam para depois.

## 6. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Virar "só um wrapper do agent-router + gates" (pouco valor) | M | A | o valor é a **transição guardada** — a etapa que não avança sem o gate; isso não existe hoje |
| Acoplar ao Claude Code e ferir a promessa multi-IA | M | M | o motor é agnóstico: abre handoffs; *quem* os pega (Claude/humano/outra IA) é externo |
| Reimplementar o que o SDD já faz | B | M | compõe `spec:check`/`project:check`/`check:all` — não reimplementa gate nenhum |

## 7. Métricas de sucesso

Um objetivo levado do `orchestrate` até o `review` com **cada transição guardada por um gate verde**,
a corrida inteira reconstruível a partir do `forja-runs.jsonl` — e uma tentativa de pular etapa
(avançar com o gate vermelho) **bloqueada** pela máquina. A orquestração deixa de ser prosa.

## 8. Decisões (aprovadas)

1. **`advance` manual.** O dono da etapa roda `orchestrate:advance` quando terminou; o motor roda o
   gate e decide. Acionar o sub-agent automaticamente fica para uma iteração futura — decidida com os
   dados do uso manual.
2. **Roda onde é invocado (`cwd`).** Framework primeiro como dogfood; por construção da 1.6.2 (o
   dispatcher propaga o cwd), o mesmo motor funciona num projeto consumidor sem código extra. O
   estado vive em `<cwd>/.context/orchestrate-<slug>.json`, ao lado dos runbooks GSD.
3. **Cadeia determinística SDD/GSD no v1.** Auditável e provável. Planejador de IA é evolução.
4. **O motor é a v1.7.0** (aditivo, não quebra nada). O 2.0 fica para a limpeza breaking
   (`dashboard/`, `projects/`, Node ≥22.6 formal) + o salto de identidade escolhido com os dados do
   motor em uso.
