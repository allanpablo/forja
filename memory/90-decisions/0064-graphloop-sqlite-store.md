# ADR-0064 — GraphLoop com porta de store e SQLite oficial

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: o GraphLoop validava evidências, relações e checksums, mas o
  store padrão era composto apenas por `Map`, fazendo nós e arestas desaparecerem
  após reinício.
- **Decisão**: o domínio define `GraphStore` síncrono. `InMemoryGraphStore`
  permanece para testes e `SqliteGraphStore` implementa a distribuição oficial.
  A migração v4 cria tabelas dedicadas para nós, arestas, evidências, fontes e
  futuras claims/contradições/agenda/extractions. O server compartilha a mesma
  instância persistente entre MCP e Runtime.
- **Consequências**: consultas e sincronização incremental sobrevivem a reinício;
  a política de “toda aresta tem endpoints e evidência” continua no core. O
  schema das entidades futuras existe, mas seus engines ainda não persistem
  automaticamente.
- **Alternativas rejeitadas**: importar SQLite no domínio; substituir a API por
  operações assíncronas nesta fase; manter o server em memória.
- **Evidência**: `packages/graph/src/index.ts`, `packages/adapter-sqlite/src/index.ts`,
  `apps/server/src/main.ts` e testes da Sprint 7.
