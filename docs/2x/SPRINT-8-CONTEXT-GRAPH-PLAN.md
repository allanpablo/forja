# Sprint 8 — Context Engine sobre GraphLoop

## Objetivo

Usar o GraphLoop persistente como fonte determinística do Context Engine,
selecionando relações relevantes com evidência, respeitando orçamento e
reutilizando conteúdo por checksum no SQLite.

## Análise de impacto

- `packages/graph`: expõe registros de contexto derivados de arestas ativas.
- `packages/context`: recebe `GraphContextSource`, mantendo a porta
  `ContextSource` e sem depender de SQLite.
- `packages/adapter-sqlite`: adiciona `SqliteContextCache` e migração v5.
- `apps/server`: compõe GraphLoop, Context Engine e cache sobre o mesmo banco;
  MCP e Runtime recebem a composição.
- contratos públicos permanecem inalterados.

## Escopo

- ranking determinístico por termos do objetivo;
- exclusão de arestas sem evidência ou fora da validade;
- referências auditáveis no `ContextPackage`;
- cache persistente por checksum;
- aplicação do orçamento existente;
- expansão de contexto a partir do cache;
- uso do pacote no bootstrap oficial.

## Fora do escopo

- embeddings ou busca vetorial;
- sumarização por LLM;
- indexação automática do workspace inteiro;
- alteração de contratos de contexto;
- compactação de logs ou decisões fora do GraphLoop.

## Critérios de aceite

1. Context Engine aceita uma fonte GraphLoop por porta, sem importar SQLite.
2. Apenas relações com evidência e termos relevantes entram como candidatos.
3. Contexto contradito/obsoleto continua excluído pelo engine.
4. Cache SQLite preserva conteúdo por checksum.
5. Orçamento limita seleção e métricas registram tokens/cache.
6. Server usa GraphLoop, Context Engine e cache no mesmo banco local.
7. Runtime recebe o pacote de contexto antes do planner sem perder seus passos.

## Hipóteses e riscos

- A relevância lexical é uma heurística determinística inicial, não uma
  promessa de busca semântica.
- O conteúdo selecionado é uma relação compacta (`origem TIPO destino`);
  expansão de trechos de arquivos será adicionada quando os extractors fornecerem
  locators e conteúdo segmentado.
- O runtime mantém `requireEvidence: false` na composição de compatibilidade,
  evitando quebrar tarefas sem relações indexadas; o MCP pode exigir evidência.

## Evidências

- `packages/context/src/index.ts`;
- `packages/graph/src/index.ts`;
- `packages/adapter-sqlite/src/index.ts`;
- `apps/server/src/main.ts`;
- `test/context.test.js`;
- `test/adapter-sqlite.test.js`.
