# ADR-0041: GraphLoop verificável separado de CodeGraph

- **Status**: accepted
- **Data**: 2026-07-31
- **Autor(es)**: ForjaJS
- **Tags**: graph, memory, evidence, codegraph

## Contexto

CodeGraph já existe no ForjaJS 1.x como índice de símbolos e blast radius. A 2.0 precisa de um
grafo de trabalho mais amplo, com projetos, specs, decisões, execuções, evidências e validade
temporal, sem transformar o domínio em dependente do binário ou MCP do CodeGraph.

## Decisão

GraphLoop é um domínio separado. Toda aresta exige endpoints existentes e ao menos uma evidência;
status e validade temporal participam das consultas. O núcleo oferece paths, impacto, contradições,
agenda e sync incremental por checksum. Extractors determinísticos têm prioridade para imports,
links Markdown e artefatos do processo. Relações semiestruturadas de LLM só poderão entrar como
`inferred`/`hypothesis`, com confiança e evidência revisável.

## Consequências

O grafo pode operar offline e receber fontes diferentes, inclusive CodeGraph, sem acoplamento. O
primeiro store é em memória; persistência SQLite e extractors de commits/diffs/specs completos
serão adapters/expansões posteriores.

## Rastreamento

- Implementação: `packages/graph/src/index.ts`
- Testes: `test/graph.test.js`
- Relacionadas: ADR-0017, ADR-0040
