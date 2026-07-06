# GSD + Hermes Harness

GSD e a camada operacional que liga SDD, sprints e handoffs Hermes por linha de comando. `design-md` entra somente quando ha impacto visual.

## Contratos

- `gsd:plan` cria `.context/gsd-<slug>.md` com gates verificaveis.
- `gsd:handoff` registra passagens padronizadas no SQLite via Hermes.
- `gsd:check` valida runbook, spec e indice codegraph. Brief visual e opcional em fluxo CLI-only.
- `code:check` valida indice codegraph (worktree + freshness) — gate de code intelligence (ADR-0017).
- `code:impact <simbolo>` mostra chamadores e blast radius antes de editar.
- `tools:doctor` faz o raio-x das ferramentas de processo (ADR-0018).
- `design:select` escolhe referencias locais de `design-md/`.
- `design:check` bloqueia brief incompleto antes de implementacao visual.

## Sequencia padrao

Todo projeto deve andar em steps, sem pular briefing, estrutura, sprints e validacao:

1. Briefing, com slug gerado
2. Estrutura do projeto
3. Sprints definidas
4. Contexto inteligente montado
5. Mapa de impacto via codegraph (`code:check` + `code:impact`) — ADR-0017
6. Spec de produto aprovada
7. Brief visual validado somente se houver UI
8. Plano tecnico e ADRs definidos
9. Desenvolvimento por Worker
10. Validacao dos passos
11. Gate final de Governance (inclui `code:check` e `tools:doctor`)

```bash
npm run dev -- gsd:plan <slug> "<objetivo>"
npm run dev -- gsd:handoff spec <slug>
npm run dev -- gsd:handoff plan <slug>
npm run dev -- gsd:handoff implement <slug>
npm run dev -- gsd:handoff review <slug>
npm run dev -- gsd:check <slug>
```

Se a entrega tiver UI:

```bash
npm run dev -- design:select <surface> <tom>
npm run dev -- design:check <brief.md>
npm run dev -- gsd:check <slug> <brief.md>
```

## Uso por papel

- Orchestrator: inicia `gsd:plan` e registra `gsd:handoff spec`.
- Product: garante que `spec.md` tenha dor, escopo, AC e metrica 30d.
- SDD Architect: roda `code:impact` para fundamentar modulos afetados, transforma spec aprovada em plan/tasks e registra implementacao.
- Worker: roda `code:impact <simbolo>` antes de editar, implementa dentro do ownership e devolve review.
- Governance: roda `gsd:check`, `code:check`, `tools:doctor`, `spec:check`, testes e `project:check`.
