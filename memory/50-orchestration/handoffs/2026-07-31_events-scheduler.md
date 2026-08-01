# Handoff — events and scheduler

- **from**: worker
- **to**: context-engineer
- **intent**: implement
- **context**: `packages/events/src/index.ts`; `packages/scheduler/src/index.ts`; `packages/contracts/src/index.ts`; `memory/90-decisions/0039-forja-2-event-bus-scheduler-local-first.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: Context Engine deve selecionar referências por checksums e orçamento; cachear sem reenviar conteúdo inalterado; consumir memória/GraphLoop por portas; produzir `ContextPackage` auditável; não chamar LLM para busca/diff/imports/SQL.
- **constraints**: domínio sem NestJS/Next/SQLite; não remover semântica append-only/idempotente; preservar retries/dead-letter; manter CLI 1.x intacta.
- **return**: devolver implementação, testes de cache/budget, evidências de tokens, riscos e próximo handoff.

## Evidências

- `npm run types:check`: passou.
- `node test/events-scheduler.test.js`: 7 testes passaram.
- Cenários: sequência/idempotência, retry, dead-letter, one-shot, cron, condição, evento,
  cancelamento e concorrência.
