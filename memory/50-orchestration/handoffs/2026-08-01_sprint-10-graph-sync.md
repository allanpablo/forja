# Handoff — Sprint 10: Graph sync

- **from**: Orchestrator
- **to**: Graph / Runtime / Governance
- **intent**: operar a indexação incremental do GraphLoop sobre workspace Git.
- **context**: `GitGraphDocumentSource` lista arquivos rastreáveis e indexáveis;
  `GraphIndexer` aplica extractors com checksum; `graph.sync` é capability
  estruturada registrada no server e protegida por permissão de escrita.
- **acceptance**: manter exclusões de escopo, idempotência, evidência e falha
  aberta para Git inválido; não podar remoções sem evidência de histórico.
- **constraints**: operação local/offline; limite de 1 MB por arquivo; sem LLM;
  commits e diffs ainda não são indexados.
- **return**: próxima sprint deve adicionar estado de sincronização/remoção e
  integrar `graph.sync` à CLI/MCP com observabilidade de duração, arquivos e
  contagens.

## Evidências

- `docs/2x/SPRINT-10-GRAPH-SYNC-PLAN.md`;
- `memory/90-decisions/0067-graph-sync-capability.md`;
- `test/adapter-git.test.js`;
- `test/graph.test.js`;
- `test/cli-capability-adapter.test.js`.
