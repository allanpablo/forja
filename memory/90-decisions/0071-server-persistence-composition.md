# ADR-0071 — Bootstrap Nest com persistência SQLite completa

- **Status:** aceito
- **Decisão:** o bootstrap oficial injeta `SqliteRuntimePersistence`,
  `SqliteGraphStore`, `SqliteApprovalStore`, `SqliteEventStore`,
  `SqliteContextCache`, `SqliteOrchestrationStore` e `SqliteObservationStore`.
  Stores em memória ficam restritos a defaults de testes e composição isolada.
- **Motivo:** a composição anterior persistia runtime, approvals, eventos, grafo e
  contexto, mas criava orquestração e observabilidade em memória.
- **Consequências:** Sprint/Task/Handoff e métricas sobrevivem ao restart; shutdown
  deve drenar publicações assíncronas do Event Bus antes de fechar SQLite.
- **Evidência:** `apps/server/src/main.ts` e `test/server-persistence.test.js`.
