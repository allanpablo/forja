# Handoff — Control Plane operacional

- **from**: control-plane-observability-engineer
- **to**: runtime-application-engineer
- **intent**: implement
- **context**: `packages/observability/src/index.ts`; `packages/adapter-nest/src/index.ts`; `apps/server/src/main.ts`; `packages/runtime/src/index.ts`; `packages/planner/src/index.ts`; `packages/validator/src/index.ts`; `memory/90-decisions/0050-forja-2-control-plane-application-ports.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: rotas Runtime existem; Control Plane delega operações; Sprint/Task/Handoff/Approvals usam engines reais; observações publicam SSE; ausência de composição falha explicitamente.
- **constraints**: não usar planner vazio; Runtime só inicia com budget, agent, policy, planner e validator; nenhuma conclusão sem validator; preservar Policy e checkpoints.
- **return**: compor `RuntimeEngine` com planner determinístico ou request planner explícito, validator independente, checkpoint store SQLite, PolicyEngine e recorder de observações; implementar start/execute/pause/resume/cancel/get no bootstrap.

## Evidências

- `npm run types:check`: passou.
- `npm run build`: passou.
- 17 arquivos de testes passaram.
- smoke test Nest/Control Plane: `control-plane-bootstrap-ok true`.
- `git diff --check`: passou.

## Pendência crítica

Runtime ainda não é habilitado por padrão até existir composição verificável de planner, validator
e policy. Isso é bloqueio de segurança/validade, não falha de transporte.

## Métricas de tokens

- orçamento explícito nos fixtures: 150 tokens de entrada e 50 de saída quando aplicável;
- consumo de LLM: não aplicável; composição, rotas e eventos foram determinísticos;
- cache: não aplicável nesta unidade.
