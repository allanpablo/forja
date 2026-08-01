# Handoff — Sprint 11: Graph sync na CLI e MCP

- **from**: Orchestrator
- **to**: Graph / MCP / Observability / Governance
- **intent**: operar e auditar sincronização do GraphLoop nas interfaces locais.
- **context**: `graph:sync` agora aponta para `graph.sync` no registry; CLI
  standalone e MCP stdio montam GraphLoop SQLite + Git source e usam o mesmo
  registro. Resultado inclui documentos, indexados, ignorados, nós, arestas,
  arquivos e duração.
- **acceptance**: manter um handler único, policy de escrita, checksum e
  exclusões de escopo; falha de Git não pode virar sucesso vazio.
- **constraints**: sem poda automática, sem commits/diffs nesta etapa e sem LLM;
  observabilidade de Control Plane detalhada ainda será consolidada.
- **return**: próxima sprint deve persistir estado de remoção/commit e ligar
  observações de `graph.sync` ao Control Plane.

## Evidências

- `docs/2x/SPRINT-11-GRAPH-SYNC-CLI-MCP-PLAN.md`;
- `memory/90-decisions/0068-graph-sync-cli-mcp.md`;
- `test/cli-capability-adapter.test.js`;
- smoke real de `capabilities:list --json` e `graph:sync --json`.
