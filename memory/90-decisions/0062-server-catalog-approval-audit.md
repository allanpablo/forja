# ADR-0062 — Catálogo oficial compartilhado e persistência de approvals/auditoria

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: o server criava `CapabilityRegistry` vazio e approvals/auditoria MCP ficavam em
  memória ou sem sink persistente.
- **Decisão**: o server constrói o catálogo usando `registerCliCapabilities` e o runner legado
  compartilhado. `ApprovalLedger` recebe a porta `ApprovalStore`, implementada pelo SQLite. MCP
  recebe `McpAuditSink`, adaptado para `SqliteAuditStore`; falha de auditoria não interrompe a
  operação, mas é responsabilidade do sink expor saúde própria.
- **Consequências**: CLI e server descobrem os mesmos IDs e compartilham handlers; approvals
  sobrevivem a reinício; chamadas MCP deixam trilha persistente. O catálogo ainda é composto em
  memória no boot, enquanto persistência de definições fica adiada.
- **Alternativas rejeitadas**: catálogo manual separado no server; ledger de approvals duplicado;
  auditoria somente em memória.
- **Evidência**: `apps/server/src/main.ts`, `packages/policy/src/index.ts`,
  `packages/adapter-sqlite/src/index.ts` e testes Sprint 5.
