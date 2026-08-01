# Handoff — Nest bootstrap

- **from**: nest-bootstrap-engineer
- **to**: sdk-control-plane-engineer
- **intent**: implement
- **context**: `apps/server/src/main.ts`; `apps/server/src/app.module.ts`; `apps/server/src/forja-nest.module.ts`; `packages/adapter-nest/src/index.ts`; `packages/mcp/src/index.ts`; `memory/90-decisions/0047-forja-2-backend-nest-adapter.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: NestJS instalado; módulo dinâmico, controller REST/SSE, guard de autenticação local, Swagger e correlation IDs delegam ao adapter; bootstrap compilado inicializa com sucesso.
- **constraints**: core sem NestJS; controller sem regra de domínio; Policy/Registry/MCP são fontes de autorização e execução; WebSocket não entra; `npm audit fix --force` não foi executado.
- **return**: implementar `packages/sdk` e interfaces do Control Plane para consumir REST/SSE, descobrir capabilities, iniciar/acompanhar runtime, responder approvals e expor métricas auditáveis.

## Evidências

- `npm run types:check`: passou.
- `npm run build`: passou.
- smoke test compilado: `nest-bootstrap-ok true`.
- `node --test test/adapter-nest.test.js`: passou.
- `git diff --check`: passou.

## Riscos

- npm reportou duas vulnerabilidades high no conjunto de dependências; a correção automática foi adiada para revisão própria.
- Testes com decorators devem usar build prévio; o runner Node strip-only não executa decorators TypeScript.

## Métricas de tokens

- orçamento explícito nos fixtures: 150 tokens de entrada e 50 de saída quando aplicável;
- consumo de LLM: não aplicável; bootstrap, compilação e smoke test foram determinísticos;
- cache: não aplicável nesta unidade.
