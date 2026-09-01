# Tasks: Predictive Change Simulation

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-01

---

## T1 — `scripts/simulate.ts`: sandbox real + grafo temporário + recomendação
- **Owner**: worker
- **Estimativa**: G
- **Depende de**: —
- **Paths**: `scripts/simulate.ts`, `lib/core/registry.ts`
- **Done quando**:
  - [ ] `SandboxEngine.create({sourceRef: ref})` → `prepare` → `execute` → `reject` → `destroy`
        (D1) — `promote()` nunca chamado em nenhum caminho, incluindo erro
  - [ ] SQLite/grafo da simulação são temporários (`mkdtemp`), nunca `getWorkspaceDbPath()` (D3)
  - [ ] `checkConstitution`/`assessRisk` rodam contra o worktree isolado, reaproveitando
        `lib/core/risk-collect.ts`
  - [ ] `recommendation` segue a regra de D4
  - [ ] worktree sempre destruído mesmo se o teste falhar ou o processo lançar exceção
        (try/finally)
  - [ ] `forja tools:doctor` continua verde

## T2 — prova de isolamento + prova sobre ref real
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: T1
- **Paths**: `test/simulate-cli.test.js` (novo)
- **Done quando**:
  - [ ] fixture git isolada: `git worktree list` antes/depois de `forja simulate` idêntico (AC-3)
  - [ ] teste com comando de teste que falha → `recommendation: 'discard'`
  - [ ] teste com violação de arquitetura injetada → `recommendation: 'review'`
  - [ ] simulação de um ref real deste repositório (§8 do spec) documentada no spec.md

---

## Handoffs entre agentes

T1 → T2 sequencial. Sem handoff de papel.
