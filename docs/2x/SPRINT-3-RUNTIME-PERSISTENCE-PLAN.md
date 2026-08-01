# Sprint 3 — Runtime persistente e retomável

## Objetivo

Fazer o Runtime sobreviver ao encerramento do processo, preservando execução, plano, resultados,
cursor, orçamento, evidências e checkpoints em SQLite.

## Escopo

- porta `RuntimePersistence` independente de banco;
- tabelas SQLite versionadas para runs, planos, resultados e estado;
- `SqliteRuntimePersistence` no adapter oficial;
- recuperação explícita com policy fornecida novamente;
- backend NestJS usando SQLite no bootstrap oficial;
- teste de pausa → fechamento do banco → novo engine → retomada;
- migração idempotente e não destrutiva.

Fora do escopo: persistência de approvals, GraphLoop, sandbox, MCP nativo e execução paralela.

## Critérios de aceite

1. `RuntimeEngine` persiste alterações sem importar SQLite.
2. Plano, resultados e próximo passo são recuperáveis por `runId`.
3. Uma execução pausada pode ser retomada por uma nova instância do engine.
4. Policy não é serializada como código; a recuperação exige policy ativa do processo.
5. Bootstrap NestJS inicializa migrações e usa SQLite por padrão.
6. Migrações podem ser reaplicadas sem duplicar estruturas ou dados.
7. Testes existentes e teste de reinício passam.

## Impacto

Afetados: `packages/runtime`, `packages/adapter-sqlite`, `apps/server` e testes. Nenhum pacote de
domínio conhece `better-sqlite3` ou SQL.

## Riscos e hipóteses

- O processo deve fornecer a mesma policy/configuração ao recuperar uma execução; políticas não
  são serializadas como funções.
- Persistência síncrona do adapter SQLite é aceitável para a primeira distribuição local-first;
  backend assíncrono substituível permanece possível pela porta.
- Cancelamento durante uma capability em andamento continua dependente do handler e não é
  interrompido à força.
