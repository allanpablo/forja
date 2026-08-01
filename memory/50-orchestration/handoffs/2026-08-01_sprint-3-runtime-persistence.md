# Handoff — Sprint 3: Runtime persistente

- **from**: Orchestrator
- **to**: Runtime Worker / Governance
- **intent**: continuar a integração operacional do Runtime sobre estado SQLite durável.
- **context**: `RuntimeEngine` agora usa a porta `RuntimePersistence`; o adapter SQLite persiste
  runs, planos, resultados e cursor. O bootstrap NestJS oficial aplica migrações e injeta o adapter.
- **acceptance**: preservar recuperação após reinício, exigir policy ativa na recuperação e manter
  migrações idempotentes. Qualquer mudança de contrato deve incluir ADR, schema e teste de replay.
- **constraints**: não serializar funções/policies; não acoplar domínio a SQLite; stores em memória
  permanecem para testes; approvals, GraphLoop, sandbox e execução paralela não estão concluídos.
- **return**: próxima sprint deve integrar persistência de approvals/eventos ou iniciar MCP sobre o
  catálogo compartilhado, após análise de impacto e critérios de recuperação.

## Entregas

- `RuntimePersistence` no domínio;
- `SqliteRuntimePersistence` e migração SQLite v2;
- recuperação de plano, resultados, cursor e policy ativa;
- server oficial inicializando SQLite no workspace;
- teste de pausa, fechamento, nova instância e retomada.

## Evidências

- `docs/2x/SPRINT-3-RUNTIME-PERSISTENCE-PLAN.md`;
- `memory/90-decisions/0060-runtime-persistence-port.md`;
- `test/runtime.test.js`;
- `test/adapter-sqlite.test.js`;
- `npm run types:check`, `npm test` e `npm run build`.
