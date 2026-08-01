# Handoff — Sprint 6: eventos persistentes e prova E2E

- **from**: Orchestrator
- **to**: GraphLoop / Runtime / Governance
- **intent**: continuar a integração operacional do ForjaJS 2.x sobre trilha de
  eventos durável.
- **context**: o Event Bus agora hidrata estado do `EventStore`, preserva
  idempotência e sequência por aggregate em SQLite, e o server registra eventos
  do Control Plane no mesmo banco local. A prova determinística cobre aprovação,
  sandbox, runtime, validator e `execution.completed`.
- **acceptance**: preservar o contrato do Event Bus, manter migrações idempotentes,
  exigir validator aceito antes de `completed` e manter a prova sem rede/LLM.
- **constraints**: SSE continua efêmero; não declarar persistência de subscriptions
  ou dead letters; não chamar o GraphLoop persistente de concluído.
- **return**: próxima sprint deve integrar GraphLoop SQLite, evidências e consultas
  de impacto ao contexto/runtime.

## Evidências

- `docs/2x/SPRINT-6-EVENTS-E2E-PLAN.md`;
- `memory/90-decisions/0063-events-persistent-e2e.md`;
- `test/events-scheduler.test.js`;
- `test/autonomy-e2e.test.js`;
- `packages/events/src/index.ts`;
- `apps/server/src/main.ts`.
