# ADR-0060 — Persistência do Runtime por porta e recuperação explícita

- **Status**: accepted
- **Data**: 2026-08-01
- **Contexto**: `RuntimeEngine` mantinha runs, planos, resultados e cursor em `Map`s. Checkpoints
  SQLite já existiam, mas não eram suficientes para recriar o engine após reinício.
- **Decisão**: o domínio expõe `RuntimePersistence` com operações para run, plano, resultados e
  cursor. `SqliteRuntimePersistence` implementa a porta usando migração versionada e payloads JSON
  em tabelas próprias. A recuperação recebe a policy ativa explicitamente; funções e dependências
  executáveis nunca são serializadas.
- **Consequências**: uma nova instância pode recuperar uma execução pausada e continuar do cursor
  persistido. O Runtime permanece independente de SQLite. A persistência síncrona é adequada para
  o backend local-first inicial e a porta permite adapter assíncrono futuro.
- **Alternativas rejeitadas**: serializar policy/handlers; depender apenas de checkpoints; acoplar
  `packages/runtime` ao driver SQLite.
- **Evidência**: `packages/runtime/src/index.ts`, `packages/adapter-sqlite/src/index.ts` e
  `test/runtime.test.js`.
