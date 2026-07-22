# ADR-0031: O motor de orquestração — a cadeia como máquina de estados guardada por gates

- **Status**: accepted
- **Data**: 2026-07-22
- **Autor(es)**: apk
- **Tags**: orchestration, gates, sdd, gsd

## Contexto

O nome do framework é orquestração multiagente. A SPEC-019 tornou a topologia *coerente*
(`agent-topology`), mas coerência não é execução: um fluxo multi-papel vivia em handoffs avulsos e
na disciplina de quem lembra de rodar os checks entre etapas. Não existia uma cadeia que **roda**,
gate a gate — o namesake era a última grande superfície por disciplina.

A tensão central: **o framework não executa IA autonomamente.** Quem faz o trabalho de cada etapa é
um agente (sub-agent do Claude Code, outra IA, ou um humano) que pega o handoff.

## Decisão

O motor é a **máquina de estados da cadeia de handoffs, com transições guardadas por gates** — e
nada mais (SPEC-021):

- `forja orchestrate "<objetivo>" --slug <s>` decompõe na cadeia SDD/GSD determinística
  (spec→plan→tasks→implement→review), abre a 1ª etapa e registra o handoff ADR-0005 do dono.
- `forja orchestrate:advance <s>` fecha a etapa **só se** (1) o artefato SDD da etapa existe e está
  aprovado e (2) o gate da transição sai verde (`spec:check` / `project:check` / `check:all`).
  Vermelho → a corrida trava com o parecer. Verde → abre a próxima e registra o handoff.
- Estado em `<cwd>/.context/orchestrate-<slug>.json`; roda onde for invocado (framework como
  dogfood; projetos consumidores por construção, graças ao cwd propagado da v1.6.2).

**O framework orquestra e guarda; o agente executa.** Honesto (não finge autonomia de IA) e ainda
assim um motor real: a cadeia progride por veredito de gate, não por memória.

## Alternativas consideradas

- **Acionar o sub-agent automaticamente no advance** — adiada: mais mágica, mais acoplamento ao
  Claude Code (fere a promessa multi-IA); será decidida com os dados do uso manual (candidata a 2.0).
- **Decomposição por LLM (cadeia sob medida)** — adiada: v1 é determinística, provável e auditável.
- **Só documentar o fluxo (status quo)** — rejeitada: é a "regra que depende de memória" (ADR-0021).

## Consequências

**Positivas**:
- Pular etapa é **bloqueado pela máquina** (provado: sem artefato o gate nem roda; draft não passa).
- Compõe o que existe: spec-cli, agent-router (7 campos), os gates, a auditoria — zero reimplementação.
- A corrida inteira é reconstruível: estado + handoffs + `forja-runs.jsonl`.

**Negativas / Trade-offs**:
- `advance` manual: o motor não empurra ninguém — cobra quando alguém tenta avançar. É o v1 honesto.
- Cadeia fixa: features fora do formato SDD (hotfix, chore) não precisam do motor — e não devem usá-lo.

## Rastreamento
- Implementação: `lib/orchestrate.ts`, `scripts/orchestrate.ts`, `test/orchestrate.test.js`
- Spec: `specs/orchestrate/spec.md` (SPEC-021)
- ADRs relacionadas: ADR-0005 (handoffs), ADR-0020 (registry), ADR-0021 (invariante > disciplina), SPEC-019 (topologia)
