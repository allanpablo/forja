# ADR-0002: SQLite + FTS5 como camada de busca de memória

- **Status**: accepted
- **Data**: 2026-04-21
- **Tags**: memory, search, performance

## Contexto
Memória cresce com o projeto. Grep linear em `memory/**/*.md` é O(n) sobre disco e ignora ranking. Indexação externa (Elastic, Meili) adiciona infra. Embeddings adicionam custo e dependência de modelo.

## Decisão
Usar SQLite com extensão FTS5 como índice de busca local. Banco em `.memory/sqlite/universal.db`, sincronizado pelo `scripts/sync-universal-memory.js`. Consultas via `scripts/query-universal-memory.js` e `lib/context-builder.js`.

## Alternativas consideradas
- **Grep direto** — rejeitada: sem ranking, sem stemming, lento em repos grandes
- **Embeddings (Chroma/Qdrant)** — rejeitada nesta fase: custo de embedding em cada sync e dependência de modelo externo. Mantida como evolução futura
- **Elasticsearch/Meilisearch** — rejeitada: infra externa, sem ganho para repos <10k arquivos

## Consequências
**Positivas**: zero infra externa, FTS5 nativo, banco versionável (ou ignorável), reconstrução determinística do índice.
**Negativas**: BM25 só (sem semântica), sync manual (não há watcher), banco pode crescer — mitigado por `compress-memory`.

## Rastreamento
- `scripts/sync-universal-memory.js`, `scripts/query-universal-memory.js`
- `lib/context-builder.js`
- `.memoryrc.json` (chave `compression`)
