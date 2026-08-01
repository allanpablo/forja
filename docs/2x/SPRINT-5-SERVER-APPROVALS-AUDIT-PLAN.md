# Sprint 5 — Catálogo padrão, approvals e auditoria MCP

## Objetivo

Fechar a composição oficial do server sobre o mesmo catálogo da CLI e tornar approvals e chamadas
MCP duráveis e auditáveis em SQLite.

## Entregas

- `createDefaultCapabilityRegistry` no server com as seis capabilities migradas;
- `ApprovalStore` no Policy Engine;
- `SqliteApprovalStore` e migração SQLite v3;
- `McpAuditSink` e `SqliteMcpAuditSink`;
- auditoria de sucesso, falha e ferramenta inexistente;
- server inicializando catálogo, approvals e auditoria no banco do workspace.

## Critérios de aceite

1. Server e CLI descobrem os mesmos seis IDs.
2. Approval criado antes do reinício pode ser consultado e decidido depois.
3. Chamada MCP gera registro de auditoria sem derrubar o transporte se o sink falhar.
4. Migrações v1–v3 são idempotentes e não destrutivas.
5. Policy continua bloqueando ações fora do escopo.
6. Testes, build e release gate passam.

## Hipóteses e riscos

- O catálogo padrão usa os handlers determinísticos existentes; capabilities futuras devem ser
  registradas no mesmo ponto de composição.
- A auditoria MCP usa `SqliteAuditStore` existente e não cria um ledger paralelo.
- `ApprovalLedger` mantém API síncrona nesta primeira distribuição local-first.
