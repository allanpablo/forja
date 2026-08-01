# ADR-0068 — Graph sync compartilhado entre CLI e MCP

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: `graph.sync` estava registrável no server, mas o dispatch
  standalone e o MCP stdio ainda criavam somente o catálogo legado.
- **Decisão**: `graph:sync` declara `capability: graph.sync` no registry do core;
  o adaptador CLI recebe uma composição opcional GraphLoop + Git source e registra
  o mesmo handler. O MCP stdio usa essa composição e descobre a ferramenta
  dinâmica automaticamente. O resultado inclui contagens, arquivos e duração.
- **Consequências**: CLI, MCP e server compartilham execução e policy; a CLI
  mantém um resumo humano e o envelope JSON. O banco local é aberto pela
  composição do processo e usa as migrações existentes.
- **Alternativas rejeitadas**: duplicar um handler em `bin/forja`; manter lista
  manual de ferramenta MCP; indexar sem `.gitignore`.
- **Evidência**: `lib/core/registry.ts`, `apps/cli/src/index.ts`, `bin/forja.ts`,
  `packages/graph/src/index.ts` e testes Sprint 11.
