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
Se este conjunto de tasks atravessa papéis (Product → SDD Architect → Worker → Governance), registre handoff via `npm run hermes:handoff` pelo core (ADR-0005).

## Evidências e estado real
- Relacione cada critério AC à task responsável e ao comando ou observação que o verifica.
- Registre resultado, data e limitações; marque concluído somente após verificar.
- Diferencie hipótese, estimativa e medição. Remova exemplos que não se aplicam.
- Documente falhas esperadas, compatibilidade e recuperação quando houver mudança de contrato.
- Para LLMs, separe sucesso de execução, formato válido e aceite por checks independentes.
