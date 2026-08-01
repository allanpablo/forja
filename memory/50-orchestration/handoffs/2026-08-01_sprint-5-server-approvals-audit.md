# Handoff — Sprint 5: server, approvals e auditoria MCP

- **from**: Orchestrator
- **to**: Runtime / MCP / Governance
- **intent**: continuar a operação persistente do control plane local-first.
- **context**: o server oficial agora compõe o mesmo catálogo de seis capabilities da CLI; approvals
  e chamadas MCP são persistidos no SQLite do workspace.
- **acceptance**: manter migrações v1–v3 idempotentes, testar recuperação de approval e preservar
  falha aberta da auditoria sem ocultar o erro do sink.
- **constraints**: não criar catálogo manual paralelo; não serializar handlers ou policies; manter
  domínio sem SQLite; GraphLoop persistente e sandbox operacional seguem pendentes.
- **return**: próxima sprint deve integrar eventos persistentes e/ou iniciar a prova ponta a ponta
  usando server, runtime, approval, sandbox e validator.

## Evidências

- `docs/2x/SPRINT-5-SERVER-APPROVALS-AUDIT-PLAN.md`;
- `memory/90-decisions/0062-server-catalog-approval-audit.md`;
- `test/policy.test.js`;
- `test/adapter-sqlite.test.js`;
- `test/mcp.test.js`;
- `npm test`, `npm run build` e `npm run release:check`.
