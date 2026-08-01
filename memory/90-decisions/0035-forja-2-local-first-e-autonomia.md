# ADR-0035: SQLite local-first e autonomia supervisionada

- **Status**: accepted
- **Data**: 2026-07-31
- **Autor(es)**: ForjaJS
- **Tags**: runtime, policy, sqlite, autonomy

## Decisão

SQLite é o backend local padrão para estado durável, eventos, auditoria, memória e checkpoints.
O nível padrão de autonomia é supervisionado: toda ação crítica passa pelo Policy Engine e uma
execução só termina após validação independente. Operações longas devem ser retomáveis.

## Alternativas rejeitadas

- banco remoto obrigatório — viola offline/local-first;
- autonomia irrestrita — não permite governança verificável;
- estado apenas em memória — perde retomada e auditoria.

## Rastreamento

- `docs/architecture/FORJA-2.0-ARCHITECTURE.md`
- `packages/contracts/`
