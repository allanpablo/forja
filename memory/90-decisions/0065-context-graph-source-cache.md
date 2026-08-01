# ADR-0065 — GraphLoop como fonte determinística do Context Engine

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: o Context Engine tinha uma porta genérica de fontes, mas o
  server não a compunha com o GraphLoop persistente; o cache padrão era apenas
  em memória.
- **Decisão**: `GraphContextSource` adapta uma porta `searchContext` e o
  GraphLoop retorna relações ativas que tenham evidência e coincidam
  deterministicamente com termos do objetivo. `SqliteContextCache` persiste o
  conteúdo por checksum. O bootstrap compartilha o banco entre GraphLoop,
  Context Engine, MCP e Runtime.
- **Consequências**: contexto mínimo pode ser recuperado offline, com referências
  auditáveis, cache e orçamento. A busca é lexical e compacta; embeddings,
  trechos de arquivos e sumarização ficam para fases posteriores.
- **Alternativas rejeitadas**: chamar LLM para busca; importar SQLite no pacote
  context; duplicar uma busca de grafo dentro do MCP.
- **Evidência**: `packages/context/src/index.ts`, `packages/graph/src/index.ts`,
  `packages/adapter-sqlite/src/index.ts`, `apps/server/src/main.ts` e testes da
  Sprint 8.
