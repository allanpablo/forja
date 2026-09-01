# Tasks: Smart Agent Routing

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-01

---

## T1 — `recommendAgent` (motor puro) + `agent:recommend` (CLI)
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: —
- **Paths**: `packages/engineering/identity/src/index.ts`, `scripts/agent.ts`, `lib/core/registry.ts`
- **Done quando**:
  - [ ] `recommendAgent` implementa a fórmula de D1, agente sem `trustLevel` não é excluído (AC-2)
  - [ ] `agent:recommend --role <role> [--domain <d>]` funcional
  - [ ] testes unitários: role casado, domain casado, sem pontuação ainda, ordenação por score
  - [ ] teste de CLI: 2+ agentes registrados com reputações diferentes, ranking correto
  - [ ] `forja tools:doctor` continua verde

---

## Handoffs entre agentes

Sprint pequeno, sem handoff — T1 é a spec inteira.
