# Handoff — Sprint 7: GraphLoop persistente

- **from**: Orchestrator
- **to**: Context / Runtime / Governance
- **intent**: continuar a integração do grafo verificável com o fluxo operacional.
- **context**: `GraphStore` foi extraído como porta do domínio; SQLite v4 persiste
  nós, arestas, evidências e checksums. O server compõe MCP e Runtime sobre o
  mesmo GraphLoop. Resultados de execução com evidência geram `Execution
  PRODUCES Capability`.
- **acceptance**: manter as invariantes de endpoints, evidência, validade temporal
  e checksum; preservar migração não destrutiva; não declarar persistidos os
  engines de contradição/agenda ainda não ligados ao schema.
- **constraints**: GraphLoop não importa SQLite/NestJS; não usar LLM para as
  relações determinísticas; não criar evidência artificial.
- **return**: próxima sprint deve ligar Context Engine ao GraphLoop persistente,
  incluindo seleção por relevância, referências de evidência e orçamento.

## Evidências

- `docs/2x/SPRINT-7-GRAPHLOOP-PERSISTENCE-PLAN.md`;
- `memory/90-decisions/0064-graphloop-sqlite-store.md`;
- `test/graph.test.js`;
- `test/adapter-sqlite.test.js`.
