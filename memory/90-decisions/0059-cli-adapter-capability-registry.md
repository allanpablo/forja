# ADR-0059 — CLI como adaptador transitório do Capability Registry

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: o Forja possuía o registry declarativo de comandos em `lib/core/registry.ts` e o
  `CapabilityRegistry` executável em `packages/core`, sem uma ponte operacional entre ambos.
- **Decisão**: migrar comandos por fatias para `apps/cli/src/index.ts`. Cada capability declara
  contrato, validação, política, alias legado e handler injetado. O binário da CLI somente adapta
  argumentos, invoca o registry e registra o resultado; comandos não migrados preservam o dispatch
  declarativo durante a transição.
- **Consequências**: CLI, descoberta e execução passam a compartilhar `ExecutionResult`, validação
  e autorização nos comandos migrados. A auditoria JSONL permanece no core executivo até o
  armazenamento de auditoria persistente ser integrado em sprint posterior.
- **Fora desta decisão**: persistência do runtime, MCP nativo, GraphLoop, sandbox e migração dos
  demais comandos.
- **Evidência**: `docs/2x/IMPLEMENTATION-AUDIT.md`, `apps/cli/src/index.ts` e
  `test/cli-capability-adapter.test.js`.
