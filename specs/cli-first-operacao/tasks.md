# Tasks: cli-first-operacao

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: done
- **Criado em**: 2026-06-02

## T1 - Corrigir sprint CLI
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: -
- **Paths**: `scripts/sprint-manager.js`, `package.json`
- **Done quando**:
  - [x] sprint funciona no repositorio raiz sem projeto
  - [x] backlog RICE P0/P1 gera itens de sprint
  - [x] `sprint:complete` esta exposto no npm

## T2 - Ajustar GSD CLI-only
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `scripts/agent-harness.mjs`
- **Done quando**:
  - [x] `gsd:check <slug>` nao falha por ausencia de brief visual

## T3 - Reduzir ruido do CLI
- **Owner**: Worker
- **Estimativa**: P
- **Depende de**: -
- **Paths**: `scripts/dev.mjs`
- **Done quando**:
  - [x] help e checks usam texto simples

## T4 - Documentar operacao
- **Owner**: Orchestrator
- **Estimativa**: P
- **Depende de**: T1, T2
- **Paths**: `README.md`, `AGENTS.md`, `docs/cli-first-operacao.md`, `docs/quick-reference.md`, `memory/50-orchestration/gsd-harness.md`
- **Done quando**:
  - [x] CLI-first e caminho principal documentado
  - [x] dashboard descrito como opcional/legado

## T5 - Corrigir gate de governanca raiz
- **Owner**: Governance
- **Estimativa**: P
- **Depende de**: T4
- **Paths**: `scripts/check-standards.js`
- **Done quando**:
  - [x] `npm run project:check` valida o framework raiz sem exigir nome de projeto
  - [x] saida usa texto simples

## Handoffs entre agentes
Fluxo aplicavel: Product -> SDD Architect -> Worker -> Governance via `npm run gsd:handoff -- <fase> cli-first-operacao`.
