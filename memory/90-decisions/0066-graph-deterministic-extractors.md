# ADR-0066 — Extração determinística incremental do GraphLoop

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: o extractor inicial cobria somente imports e links Markdown,
  deixando specs, ADRs, tarefas, handoffs, testes e manifests fora do grafo.
- **Decisão**: ampliar o extractor por padrões explícitos e auditáveis: símbolos,
  chamadas, referências ADR, checkboxes, agentes de handoff, testes e dependências
  de manifest. Cada relação usa uma evidência com locator de linha e é aplicada
  pela mesma mutation com checksum.
- **Consequências**: consultas de impacto e contexto ganham relações offline sem
  custo de LLM. A resolução semântica completa de TypeScript, aliases, commits e
  diffs permanece fora do extractor lexical.
- **Alternativas rejeitadas**: inferência por LLM para relações determinísticas;
  parser completo obrigatório nesta etapa; aceitar arestas sem evidência.
- **Evidência**: `packages/graph/src/index.ts` e `test/graph.test.js`.
