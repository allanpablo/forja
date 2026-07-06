# ADR Template - Architecture Decision Records

Use este template para documentar decisões arquiteturais importantes.

## ADR-YYYYMMDD-XXX: {Título da Decisão}

**Date**: YYYY-MM-DD  
**Status**: Proposed | Accepted | Deprecated | Superseded by ADR-...  
**Deciders**: [names]

## Context

Descreva o problema ou situação que motivou esta decisão.

**Background**:
- What is the issue?
- Why now?
- What constraints exist?

**Options Considered**:
1. Option A
2. Option B
3. Option C

## Decision

Declare qual opção foi escolhida e por quê.

## Consequences

### Positive
- Benefit 1
- Benefit 2

### Negative
- Risk 1
- Risk 2

### Neutral
- Other impact 1

## Rationale

Explique o raciocínio por trás dessa decisão em detalhes.

## Related ADRs

- ADR-YYYYMMDD-XXX (related decision)
- ADR-YYYYMMDD-YYY (conflicting/complementary decision)

## Examples

### Exemplo: Por que PostgreSQL?

**ADR-20240115-001: Database Choice**

**Context**
- Need relational data (users, orgs, subscriptions, invoices)
- Transactions required (ACID) for billing
- Multi-tenant architecture demands row-level security
- Cost considerations

**Decision**
PostgreSQL with row-level tenant isolation (tenantId column)

**Consequences**
- ✅ Strong ACID guarantees for billing
- ✅ Mature ecosystem, lots of examples
- ✅ Managed options (RDS, Heroku)
- ✅ Full-text search (future feature)
- ❌ Slightly higher latency vs NoSQL (acceptable)
- ❌ Vertical scaling limits (acceptable for MVP)

**Rationale**
Banking/billing requires ACID compliance. MongoDB would introduce risks for money operations. PostgreSQL is battle-tested in production SaaS platforms.
