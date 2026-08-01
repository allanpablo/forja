# ADR-0067 — Indexação GraphLoop por fonte Git e capability `graph.sync`

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: extractors determinísticos existiam, mas não havia uma operação
  incremental que lesse o workspace e aplicasse mutations ao GraphLoop.
- **Decisão**: `GraphIndexer` recebe uma porta `GraphDocumentSource`; o adapter
  `GitGraphDocumentSource` usa `git ls-files` e leitura local limitada; a
  capability `graph.sync` executa o indexador, retorna contagens estruturadas e
  gera evidência. O server compõe essa capability sobre `SqliteGraphStore`.
- **Consequências**: indexação local é reproduzível, incremental e sem LLM;
  arquivos ignorados ficam fora. Remoções, commits e diffs exigem uma próxima
  evolução para não introduzir poda ou histórico incorreto nesta fase.
- **Alternativas rejeitadas**: varrer recursivamente sem respeitar `.gitignore`;
  indexar conteúdo binário; criar um segundo registry específico para o grafo.
- **Evidência**: `packages/graph/src/index.ts`, `packages/adapter-git/src/index.ts`,
  `apps/cli/src/index.ts`, `apps/server/src/main.ts` e testes Sprint 10.
