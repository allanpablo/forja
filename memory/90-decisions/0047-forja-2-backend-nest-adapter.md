# ADR-0047 — Backend Nest como composição externa do núcleo

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: O ForjaJS precisa de uma distribuição oficial HTTP em NestJS sem mover regras de domínio para controllers, guards ou decorators.
- **Decisão**: `packages/adapter-nest` define a fronteira REST/SSE, autenticação por porta, correlation IDs, erros normalizados, módulos e OpenAPI. `apps/server` compõe essa fronteira e será o bootstrap Nest oficial quando as dependências do framework forem instaladas.
- **Regras**:
  - chamadas delegam ao `McpServer`/application ports e não implementam domínio;
  - Policy e identidade permanecem no Registry/MCP/application layer;
  - REST é a interface inicial e SSE é o canal de eventos;
  - WebSocket permanece adiado;
  - autenticação local é uma porta substituível;
  - controllers Nest, guards e Swagger ficam na camada externa.
- **Alternativas rejeitadas**:
  - importar NestJS no domínio: viola a direção de dependências;
  - implementar autorização apenas em controllers: permitiria bypass por MCP/CLI;
  - exigir WebSocket nesta fase: não há requisito verificável além de SSE.
- **Consequências**: O backend oficial adiciona dependências Nest no root e usa compilação TypeScript antes da execução. O adapter-neutral continua testável sem servidor.
- **Evidências**: `apps/server/src/main.ts`, `apps/server/src/app.module.ts`, `test/adapter-nest.test.js`, `npm run types:check`, `npm run build`, smoke test `nest-bootstrap-ok`.
