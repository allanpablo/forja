# Handoff — context engine

- **from**: context-engineer
- **to**: graph-engineer
- **intent**: implement
- **context**: `packages/context/src/index.ts`; `packages/contracts/src/index.ts`; `memory/90-decisions/0040-forja-2-context-engine-budget-cache.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`; `memory/90-decisions/0017-codegraph-no-harness-gsd.md`
- **acceptance**: GraphLoop deve persistir nós/arestas/evidências com status e validade; extrair imports, links Markdown, specs, ADRs, commits, diffs, tarefas, handoffs e testes deterministicamente; consultar caminho, impacto, contradições e lacunas; nenhuma aresta sem origem.
- **constraints**: separar GraphLoop de CodeGraph; não importar NestJS/Next/SQLite no domínio; LLM apenas para relação semiestruturada com confiança/evidência/status; manter Context Engine consumível por porta.
- **return**: devolver entidades, consultas, extractors, invariantes, testes de consistência e próximo handoff.

## Evidências

- `npm run types:check`: passou.
- Testes combinados: 7 arquivos passaram.
- Cenários: seleção por relevância, deduplicação, obsoletos, contraditos, orçamento, cache,
  expansão e ausência de evidência.
