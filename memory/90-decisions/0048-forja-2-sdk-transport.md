# ADR-0048 — SDK sobre transporte substituível

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: CLI, agentes e plugins precisam consumir a plataforma sem depender de NestJS, Express ou de uma biblioteca HTTP específica.
- **Decisão**: `packages/sdk` expõe `ForjaSdk` sobre `SdkTransport`, com métodos tipados para capabilities, contexto, GraphLoop, orquestração, runtime, approvals, métricas e eventos.
- **Regras**:
  - transporte injeta headers de token e correlation ID;
  - respostas não-2xx geram `SdkError` estruturado;
  - eventos são opcionais e falham explicitamente quando o transporte não suporta subscription;
  - tipos de domínio vêm de `packages/contracts`;
  - o SDK não executa regra de negócio nem replica Policy.
- **Alternativas rejeitadas**:
  - acoplar diretamente a `fetch`: dificultaria CLI offline, testes e futuros transports;
  - retornar `unknown` para toda a API: perderia o benefício dos contratos tipados;
  - esconder erros HTTP: impediria governança e retry consciente.
- **Consequências**: O Control Plane deve implementar as rotas de runtime, approvals, métricas e CRUD de Sprint/Task para completar a superfície do SDK.
- **Evidências**: `packages/sdk/src/index.ts`, `test/sdk.test.js`, `npm run types:check`, `npm run build`.
