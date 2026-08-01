# Handoff — adapter SQLite

- **from**: persistence-adapter-engineer
- **to**: mcp-application-engineer
- **intent**: implement
- **context**: `packages/adapter-sqlite/src/index.ts`; `packages/contracts/src/index.ts`; `packages/events/src/index.ts`; `packages/runtime/src/index.ts`; `packages/orchestration/src/index.ts`; `memory/90-decisions/0045-forja-2-sqlite-adapter.md`; `docs/architecture/FORJA-2.0-IMPACT-FOUNDATION.md`
- **acceptance**: migrações versionadas e idempotentes; persistência de Sprint, Task, Handoff, Sandbox, Checkpoint, Runtime Run, Event e Auditoria; eventos deduplicados por idempotência; retomada recupera checkpoint.
- **constraints**: domínio sem SQLite/driver; nenhuma migração destrutiva; JSON e SQL confinados ao adapter; manter contratos versionados e resultados auditáveis.
- **return**: implementar `packages/mcp` como adaptador sobre Capability Registry, Context, GraphLoop e orchestration, com schemas derivados dos contratos, policy aplicada, identidade registrada e erros normalizados.

## Evidências

- `npm run types:check`: passou.
- `node --test test/adapter-sqlite.test.js`: passou.
- `git diff --check`: passou.

## Métricas de tokens

- orçamento explícito nos fixtures: 150 tokens de entrada e 50 de saída quando aplicável;
- consumo de LLM: não aplicável; migração, serialização e idempotência foram determinísticas;
- cache: não aplicável nesta unidade.
