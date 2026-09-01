# Tasks: AI Code Provenance + AI-SBOM

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-01

---

## T1 — `extractProvenance` (motor puro) + `SqliteProvenanceStore` + CLI
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: —
- **Paths**: `packages/engineering/provenance/src/index.ts`, `packages/adapter-sqlite/src/index.ts`,
  `scripts/provenance.ts`, `lib/core/registry.ts`
- **Done quando**:
  - [ ] `extractProvenance` mapeia `RuntimeRun.changedFiles` → `ProvenanceRecord[]`, `lines`
        sempre `undefined` (AC-2)
  - [ ] `provenance:record <run-id>` lê o run real (`SqliteRuntimeRunStore.get`), persiste via
        `SqliteProvenanceStore` (zero migration nova)
  - [ ] `blame <file>` / `sbom [--json]` funcionais
  - [ ] `forja tools:doctor` continua verde
  - [ ] testes unitários de `extractProvenance` (sem `fs`/rede)

## T2 — prova sobre dado real/sintético documentado
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: T1
- **Paths**: `test/provenance-cli.test.js` (novo)
- **Done quando**:
  - [ ] fixture isolada: seed de 1+ `RuntimeRun` (sintético documentado como tal, §8 do spec),
        `provenance:record` + `blame` + `sbom` ponta a ponta
  - [ ] `blame` de um arquivo nunca tocado devolve vazio, não erro

---

## Handoffs entre agentes

T1 → T2 sequencial. Sem handoff de papel.
