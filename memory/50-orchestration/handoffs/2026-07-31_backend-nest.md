# Handoff — backend Nest adapter

- **from**: backend-application-engineer
- **to**: nest-bootstrap-engineer
- **intent**: implement
- **context**: `packages/adapter-nest/src/index.ts`; `apps/server/src/index.ts`; `packages/mcp/src/index.ts`; `memory/90-decisions/0047-forja-2-backend-nest-adapter.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: fronteira REST/SSE possui correlation IDs, autenticação local, OpenAPI e erros normalizados; `apps/server` compõe módulos oficiais; nenhuma regra crítica vive no frontend/controller.
- **constraints**: manter core sem NestJS; usar Policy/Registry/MCP como fontes de autorização/execução; REST + SSE inicialmente; não adicionar WebSocket sem requisito; não inventar dados de recursos.
- **return**: instalar/configurar NestJS oficialmente, criar bootstrap `main`, módulos/controllers/guards/swagger que deleguem ao adapter, health check, autenticação local e teste e2e determinístico.

## Evidências

- `npm run types:check`: passou.
- `node --test test/adapter-nest.test.js`: passou.
- `git diff --check`: passou.
- Dependência NestJS ainda ausente; bootstrap real permanece pendente.

## Métricas de tokens

- orçamento explícito nos fixtures: 150 tokens de entrada e 50 de saída quando aplicável;
- consumo de LLM: não aplicável; roteamento HTTP, autenticação e OpenAPI foram determinísticos;
- cache: não aplicável nesta unidade.
