# ADR-0063 — Event Bus SQLite e prova E2E determinística

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: o Event Bus tinha append, retries e idempotência apenas em memória;
  o server publicava eventos somente no stream SSE e não havia uma prova integrada
  do ciclo supervisionado.
- **Decisão**: o `EventBus` hidrata idempotência e sequências a partir de qualquer
  `EventStore` antes do primeiro append/list. O bootstrap NestJS usa
  `SqliteEventStore` no banco local e encaminha publicações do Control Plane para
  SSE e persistência. A prova operacional usa capability, sandbox e validator
  determinísticos, sem LLM.
- **Consequências**: eventos de domínio sobrevivem ao reinício e não duplicam por
  idempotency key; a entrega SSE continua local e efêmera; subscriptions e dead
  letters ainda não são duráveis entre processos.
- **Alternativas rejeitadas**: broker externo nesta fase; catálogo paralelo de
  eventos; prova baseada em chamada real de modelo.
- **Evidência**: `packages/events/src/index.ts`, `apps/server/src/main.ts`,
  `test/events-scheduler.test.js` e `test/autonomy-e2e.test.js`.
