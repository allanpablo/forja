# Handoff — Runtime Control Plane

- **from**: runtime-application-engineer
- **to**: evals-plugin-dashboard-engineer
- **intent**: implement
- **context**: `apps/server/src/main.ts`; `packages/runtime/src/index.ts`; `packages/observability/src/index.ts`; `packages/adapter-nest/src/index.ts`; `packages/sdk/src/index.ts`; `memory/90-decisions/0051-forja-2-runtime-control-plane-composition.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: Runtime start/execute/pause/resume/cancel/get delegado pelo Control Plane; etapas explícitas e budget validados; Policy read-only local; validator independente exige evidência; observações e SSE são publicados.
- **constraints**: não habilitar escrita sem Policy/approval; não usar planner vazio; não concluir sem validator; manter checkpoint e limites do Runtime; não usar LLM para planejamento determinístico.
- **return**: implementar Evaluation Engine, Plugin SDK permissionado e dashboard/control plane operacional para métricas, avaliações, custos, runs, approvals e GraphLoop.

## Evidências

- `npm run types:check`: passou.
- `npm run build`: passou.
- 17 arquivos de testes passaram.
- smoke `runtime-control-plane-ok completed accepted 2`.
- `git diff --check`: passou.

## Métricas de tokens

- orçamento explícito no smoke: 10 tokens de entrada, 0 de saída, 1 token estimado usado;
- consumo de LLM: não aplicável; planner, validator e Policy foram determinísticos;
- observações geradas: 2.
