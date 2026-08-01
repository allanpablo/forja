# Handoff — observability e Control Plane

- **from**: control-plane-observability-engineer
- **to**: runtime-application-engineer
- **intent**: implement
- **context**: `packages/observability/src/index.ts`; `packages/adapter-sqlite/src/index.ts`; `packages/adapter-nest/src/index.ts`; `packages/sdk/src/index.ts`; `memory/90-decisions/0049-forja-2-observability-control-plane.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: Observations auditáveis são persistidas; métricas por run/agent/task/sprint/capability incluem tokens, custo, duração, outcome e evidência; endpoints de métricas/observações delegam ao Control Plane.
- **constraints**: sem agregação no controller/dashboard; sem LLM para métricas; preservar append-only/idempotência; não declarar runtime/approvals/Sprint/Task concluídos sem application service real.
- **return**: integrar Runtime, Policy approvals e Orchestration ao Control Plane, implementar rotas `/api/executions`, `/api/approvals`, `/api/sprints` e `/api/tasks`, publicar observações e eventos SSE.

## Evidências

- `npm run types:check`: passou.
- `npm run build`: passou.
- testes focados de observabilidade, Nest e SDK passaram.
- `git diff --check`: passou.

## Riscos

- npm mantém duas vulnerabilidades high pendentes de revisão.
- Rotas de runtime, approvals e CRUD ainda são pendência do próximo application service.

## Métricas de tokens

- orçamento explícito nos fixtures: 150 tokens de entrada e 50 de saída quando aplicável;
- consumo de LLM: não aplicável; registro e agregação foram determinísticos;
- cache: não aplicável nesta unidade.
