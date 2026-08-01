# Sprint 7 — GraphLoop persistente e evidências de execução

## Objetivo

Substituir o store oficial em memória do GraphLoop por uma porta de domínio com
adapter SQLite, preservar as invariantes de evidência e checksum e registrar no
grafo as relações produzidas por execuções do Runtime.

## Análise de impacto

- `packages/graph`: passa a depender de `GraphStore`, sem conhecer SQLite.
- `packages/adapter-sqlite`: recebe migração v4 e `SqliteGraphStore`.
- `apps/server`: compõe MCP e Runtime com o mesmo GraphLoop SQLite.
- `packages/runtime`: não é alterado conceitualmente; usa a porta existente
  `RuntimeMemory` por meio de um adapter em `packages/graph`.
- Context Engine permanece consumindo fontes por porta; a seleção semântica
  completa sobre nós e trechos é escopo posterior.

## Escopo

- nós, arestas, evidências e checksums de origem persistidos;
- tabelas preparatórias para claims, contradições, agenda e extrações;
- recuperação após reconstrução do `GraphLoop`;
- consultas, path e impacto sobre dados SQLite;
- memória de execução com relação `Execution PRODUCES Capability` auditada.

## Fora do escopo

- banco externo ou consultas assíncronas;
- inferência por LLM;
- detecção avançada de contradições além das regras existentes;
- indexação automática de todo workspace no bootstrap;
- dashboard novo.

## Critérios de aceite

1. Migrações v1–v4 são idempotentes e não destrutivas.
2. `SqliteGraphStore` satisfaz a porta usada pelo domínio e não importa NestJS.
3. Nós, evidências, arestas e checksum sobrevivem à recriação do GraphLoop.
4. A segunda aplicação da mesma fonte é ignorada por checksum.
5. Nenhuma aresta é salva sem endpoints e evidência existente.
6. Runtime pode registrar uma execução como relação verificável no grafo.
7. Server usa o GraphLoop SQLite para MCP e Runtime.

## Hipóteses e riscos

- A API síncrona atual do GraphLoop é mantida para preservar os consumidores
  existentes e adequar-se ao SQLite local.
- Tabelas de claims/contradições/agenda/extractions são fundação de schema, não
  significam que seus engines estejam persistentes nesta sprint.
- A prova de execução registra evidências já produzidas pelo handler; não cria
  evidência artificial para ações sem prova.

## Evidências

- `packages/graph/src/index.ts`;
- `packages/adapter-sqlite/src/index.ts`;
- `apps/server/src/main.ts`;
- `test/graph.test.js`;
- `test/adapter-sqlite.test.js`.
