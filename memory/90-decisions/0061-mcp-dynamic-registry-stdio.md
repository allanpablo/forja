# ADR-0061 — MCP dinâmico sobre o Registry e transporte stdio local

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: o adapter MCP possuía ferramentas fixas e executava capabilities quando o
  consumidor fornecia um registry, mas não expunha `describe` nem descoberta dinâmica dos aliases.
- **Decisão**: manter ferramentas operacionais fixas para recursos do Forja e adicionar uma
  ferramenta derivada para cada capability visível (`forja_capability_<id>`), além de
  `forja_capability_describe`. `forja mcp:start` fornece transporte JSON-RPC local por stdio e
  delega todas as chamadas ao `McpServer`.
- **Consequências**: clientes podem descobrir o catálogo sem documentação humana e executar pelo
  mesmo registry usado pela CLI. O transporte não conhece handlers nem implementa regras de
  autorização; schemas detalhados permanecem nos validadores do registry.
- **Alternativas rejeitadas**: lista manual de cada capability; handler MCP duplicado; servidor
  remoto obrigatório nesta etapa.
- **Evidência**: `packages/mcp/src/index.ts`, `bin/forja.ts`, `test/mcp.test.js` e o smoke stdio.
