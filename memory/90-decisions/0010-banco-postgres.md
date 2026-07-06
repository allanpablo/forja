# ADR-0010: Banco principal em Postgres

- **Status**: accepted
- **Data**: 2026-05-22
- **Autor(es)**: apk
- **Tags**: data, architecture

## Contexto
O projeto precisa armazenar inventario, checks, alertas e historico de disponibilidade com retencao de 12 meses, alem de suportar consultas por empresa e relatarios mensais. A operacao e self-hosted em Debian 13 com Dokploy.

## Decisao
Usar **Postgres** como banco de dados principal para inventario, checks, alertas e storage.

## Alternativas consideradas
- **SQLite**: rejeitada por concorrencia limitada e maior risco de bloqueio com historico de checks.
- **Banco timeseries dedicado**: rejeitado por aumentar complexidade operacional na v1.

## Consequencias
**Positivas**:
- Melhor concorrencia e indices para consultas por empresa e periodo.
- Evolucao de schema mais segura para crescimento futuro.

**Negativas / Trade-offs**:
- Exige container/servico Postgres e backup separado.
- Maior custo operacional que SQLite.

## Rastreamento
- Implementacao: `backend/src/modules/*`, `backend/prisma/*`
- Issues/PRs: n/a
- ADRs relacionadas: n/a
