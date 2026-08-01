# ADR-0049 — Observabilidade como fonte do Control Plane

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: Autonomia supervisionada exige medir execução, contexto, custo, validação, retrabalho e evidência por várias dimensões operacionais.
- **Decisão**: `packages/observability` registra `Observation` estruturada e calcula `ControlPlaneMetrics`. `SqliteObservationStore` fornece persistência local e `ControlPlanePort` expõe consultas ao adapter HTTP.
- **Regras**:
  - cada observação tem `traceId`, outcome e campos de custo/tempo/tokens;
  - cobertura de evidência é calculada a partir de refs de contexto ou checksum de entrada;
  - agregação não vive em controller, dashboard ou SDK;
  - observações são append-only no store lógico;
  - métricas vazias retornam zeros, não `NaN`.
- **Alternativas rejeitadas**:
  - métricas apenas em logs: dificulta consulta estruturada e avaliação;
  - custo apenas por modelo: perde relação com task, capability e run;
  - observabilidade apenas no dashboard: quebra operação CLI/offline.
- **Consequências**: O Control Plane deve receber eventos do Runtime, Registry, Context e Validator. Rotas de runtime, approvals e CRUD de Sprint/Task ainda precisam de application services.
- **Evidências**: `packages/observability/src/index.ts`, `packages/adapter-sqlite/src/index.ts`, `test/observability.test.js`, `npm run types:check`, `npm run build`.
