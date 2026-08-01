# ADR-0050 — Control Plane por portas de aplicação

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: Rotas HTTP precisam coordenar Runtime, Orchestration, Approvals e Observabilidade sem transferir composição ou regras para controllers.
- **Decisão**: `ControlPlanePort` expõe operações opcionais por portas de aplicação. `ControlPlane` delega para serviços configurados, publica observações/eventos e falha explicitamente quando uma composição não existe. O bootstrap oficial compõe Sprint/Task/Handoff e ApprovalLedger reais.
- **Regras**:
  - ausência de serviço retorna erro estruturado, nunca sucesso vazio;
  - controllers somente transportam request/response;
  - eventos SSE derivam de eventos do Control Plane;
  - Runtime só será habilitado com planner, validator e Policy reais;
  - operações críticas permanecem sujeitas ao Policy Engine.
- **Alternativas rejeitadas**:
  - planner vazio para “habilitar” Runtime: permitiria conclusão falsa;
  - regras de transição no controller: duplicaria Orchestration;
  - polling obrigatório para observabilidade: perde atualização operacional e aumenta custo.
- **Consequências**: Sprint/Task/Handoff/Approvals estão compostos no servidor. Runtime ainda requer uma aplicação específica que converta entrada HTTP em `RuntimeStartRequest` seguro.
- **Evidências**: `apps/server/src/main.ts`, `packages/observability/src/index.ts`, `packages/adapter-nest/src/index.ts`, `test/adapter-nest.test.js`, `npm run build`, smoke `control-plane-bootstrap-ok`.
