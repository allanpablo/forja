# Tasks: {{FEATURE}}

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: draft
- **Criado em**: {{DATE}}

> Decomposição executável. Cada task tem dono claro, critério de done e referência a arquivos.

Convenção de IDs: `T1`, `T2`, ... Sequência reflete ordem de execução padrão (pode ser paralelizada quando indicado).

---

## T1 — <título curto>
- **Owner**: <agente ou pessoa>
- **Estimativa**: <P/M/G>
- **Depende de**: —
- **Paths**: `lib/...`, `scripts/...`
- **Done quando**:
  - [ ] ...
  - [ ] testes passando
  - [ ] doc atualizada (se aplicável)

## T2 — ...
- **Owner**: ...
- **Depende de**: T1
- ...

---

## Handoffs entre agentes
Se este conjunto de tasks atravessa papéis (Product → SDD Architect → Worker → Governance), registre handoff via `scripts/append-handoff.mjs` ou tabela `handoffs` do `universal.db` (ADR-0005).
