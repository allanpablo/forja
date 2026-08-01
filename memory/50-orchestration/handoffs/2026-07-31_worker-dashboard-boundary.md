# Handoff — Worker e Dashboard boundary

- **from**: dashboard-worker-engineer
- **to**: next-distribution-engineer
- **intent**: implement
- **context**: `apps/worker/src/main.ts`; `apps/dashboard/src/index.ts`; `packages/observability/src/index.ts`; `packages/events/src/index.ts`; `packages/scheduler/src/index.ts`; ADR-0054
- **acceptance**: worker compõe Event Bus/Scheduler/Evaluation; dashboard lê Control Plane e delega ações críticas; nenhuma regra crítica está no view model; testes e build passam.
- **constraints**: não conectar dashboard diretamente a SQLite; não autorizar no cliente; preservar backend offline e contratos existentes; Next/React deve ser adaptador de distribuição.
- **return**: ligar a distribuição Next.js/React, TanStack Query, SSE e telas operacionais sobre esse boundary; depois validar release/packaging.

## Evidências

- `npm run types:check`: passou.
- `npm run build`: passou.
- `node --import tsx --test test/dashboard-worker.test.js`: passou.
- `npm test`: pendente após esta unidade.
- `git diff --check`: pendente após esta unidade.

## Métricas de tokens

- consumo de LLM: não aplicável;
- worker sem execução de agente no teste;
- dashboard usa somente métricas/observações fornecidas pelo Control Plane.
