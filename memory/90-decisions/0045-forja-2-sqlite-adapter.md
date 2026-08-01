# ADR-0045 — Adapter SQLite por porta e migrações idempotentes

- **Status**: accepted
- **Data**: 2026-07-31
- **Contexto**: O ForjaJS precisa sobreviver a reinícios e manter eventos, checkpoints, sessões, entidades de sprint e trilha de auditoria em execução local/offline.
- **Decisão**: `packages/adapter-sqlite` expõe uma interface mínima `SqliteConnection`, um runner de migrações versionadas e repositórios específicos sobre uma tabela de registros JSON, uma tabela append-only de eventos e uma tabela de auditoria.
- **Regras**:
  - migrações são ordenadas por versão e reaplicação é no-op;
  - eventos têm `idempotency_key` único e não são sobrescritos;
  - domínio não importa `better-sqlite3` nem conhece SQL;
  - serialização JSON é responsabilidade do adapter;
  - restauração de checkpoint é indexada por `runId`;
  - a migração não remove tabelas ou dados existentes.
- **Alternativas rejeitadas**:
  - importar `better-sqlite3` em cada pacote de domínio: criaria acoplamento ao driver nativo;
  - criar uma tabela específica para cada entidade nesta primeira fatia: aumentaria o custo de migração antes de estabilizar os contratos;
  - usar apenas memória: perderia retomada e auditoria após reinício.
- **Consequências**: O adapter de composição deve executar `SqliteMigrationRunner` na inicialização. A evolução de schemas JSON exigirá validação e migração explícita quando os contratos estabilizarem.
- **Evidências**: `test/adapter-sqlite.test.js`, `npm run types:check`, `git diff --check`.
