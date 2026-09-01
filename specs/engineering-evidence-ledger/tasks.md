# Tasks: Engineering Evidence Ledger + `forja engineer`

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-09-01

---

## T1 — `buildEvidenceLedger` (view pura) + `evidence:show`
- **Owner**: worker
- **Estimativa**: M
- **Depende de**: —
- **Paths**: `packages/engineering/evidence/src/index.ts`, `scripts/evidence.ts`, `lib/core/registry.ts`
- **Done quando**:
  - [ ] `buildEvidenceLedger` mapeia `EvidenceLedgerInput` → `EvidenceLedgerRecord` sem inventar
        nenhum campo que não veio no input (AC-1)
  - [ ] `evidence:show <run-id>` busca `RuntimeRun` real (`SqliteRuntimeRunStore`), `AuditRecord`s
        (`SqliteAuditStore`, filtrado por `aggregateId === runId`), `ApprovalRequest`s
        (`ApprovalLedger`, filtrado por `correlationId === runId`)
  - [ ] testes unitários (sem `fs`/rede): campos opcionais ausentes não aparecem como `null`
        inventado; `run-id` inexistente é erro claro, não JSON vazio

## T2 — `forja engineer "<objetivo>"` façade
- **Owner**: worker
- **Estimativa**: G
- **Depende de**: T1 (reaproveita o mesmo padrão engine-puro/CLI-adapter)
- **Paths**: `scripts/engineer.ts`, `lib/core/registry.ts`
- **Done quando**:
  - [ ] compõe, na ordem do plan: `ContextEngine.build()` → `contextRecords` filtrado a ADR/SPEC →
        `architecture:check` não escopado → `RiskEngine.assess()` só com `--ref` (D1) → fluxo
        recomendado parseado de `docs/fluxo.md` (D2)
  - [ ] `--json` produz JSON estruturado; sem a flag, texto legível
  - [ ] nenhuma string sintetizada além do que os componentes já disseram (grep manual: sem
        chamada de LLM/heurística de texto livre em `scripts/engineer.ts`)
  - [ ] `forja tools:doctor` continua verde

## T3 — prova sobre objetivo real deste repositório
- **Owner**: worker
- **Estimativa**: P
- **Depende de**: T2
- **Paths**: `test/engineer-cli.test.js` (novo)
- **Done quando**:
  - [ ] fixture git isolada: `engineer "<objetivo>"` roda ponta a ponta (sem `--ref`) e produz
        texto com todas as seções (contexto, ADRs relevantes, architecture:check, fluxo)
  - [ ] com `--ref`, a seção de risco aparece com score real
  - [ ] `evidence:show` recupera um run persistido de ponta a ponta

---

## Handoffs entre agentes

T1 → T2 → T3 sequencial. Sem handoff de papel — spec e plan já aprovados cobrem as decisões de
produto/arquitetura.
