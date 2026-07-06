# Template de Architecture Decision Record (ADR)

## ADR-001: Stack Técnico (NestJS + PostgreSQL)

**Status**: Accepted  
**Date**: 2024-01-15  
**Deciders**: Backend Team  
**Consulted**: DevOps, DBA  

### Context

Precisamos escolher um framework e banco de dados para a plataforma de e-commerce com requisitos de:
- Alta performance (< 200ms p95)
- Escalabilidade (10k+ produtos)
- Type safety
- Ecossistema maduro

### Decision

Utilizaremos:
1. **NestJS** + **TypeScript** para backend
2. **PostgreSQL 14+** como banco de dados
3. **Redis** para cache (future)

### Rationale

**NestJS**
- ✅ TypeScript built-in (type safety)
- ✅ Arquitetura modular clara
- ✅ Dependency injection nativa
- ✅ Ecossistema maduro (TypeORM, Passport, Swagger)
- ✅ Performance comparável a Express

**PostgreSQL**
- ✅ ACID transactions (critical para checkout)
- ✅ JSON support (endereços, metadata)
- ✅ Full-text search built-in
- ✅ Índices eficientes
- ✅ Escalável (connections, replication)

### Consequences

**Positivos**
- ✅ Type safety em tempo de compilação
- ✅ Rápido desenvolvimento
- ✅ Fácil para novos devs (comunidade NestJS grande)
- ✅ Bom suporte a dependências externas

**Negativos**
- ⚠️ Overhead de framework vs Node puro
- ⚠️ Node.js não é multi-threaded (limita por CPU)
- ⚠️ PostgreSQL requer setup e gerenciamento

### Alternatives Considered

| Alternativa | Razão de Rejeição |
|-------------|-------------------|
| Express + Node puro | Menos type-safe, mais boilerplate |
| FastAPI (Python) | Time expertise em Node/TypeScript |
| Go + fiber | Tech debt, learn curve |
| MongoDB | Sem ACID transactions (requisito crítico) |

### Migration Path

Se no futuro precisar migrar:
1. NestJS permite trocar DB (TypeORM abstrai)
2. API contracts permanecem iguais
3. Cache layer (Redis) pode ser adicionado incrementalmente

---

## ADR-002: Autenticação Mock para MVP

**Status**: Accepted  
**Date**: 2024-01-15  

### Context

MVP precisa de autenticação mas não temos backend de identity real. Implementar OAuth/real auth agora seria overhead.

### Decision

Usar JWT mock:
- Login retorna token válido qualquer credencial
- Token válido por 1h
- Sem real password validation

### Rationale

- ✅ Rápido desenvolvimento
- ✅ Permite testar fluxos completos
- ✅ Fácil migração para real auth depois

### Consequences

**Para Produção**: Substituir com:
```typescript
// Real bcrypt validation
const isValid = await bcrypt.compare(password, hashedPassword);
```

### Timeline Sugerido

- MVP: Mock auth
- Phase 2: Integrar Auth0 ou Cognito

---

## ADR-003: Mock Stripe em vez de Real

**Status**: Accepted  
**Date**: 2024-01-15  

### Context

Integrar real Stripe agora seria complexo (PCI compliance, keys). MVP precisa testar fluxo de pagamento.

### Decision

Mock Stripe: 90% sucesso, 10% recusa (aleatório)

### Implementation

```typescript
const random = Math.random() * 100;
const isApproved = random >= 10;
```

### Migration Path

Para produção:
```typescript
// Real Stripe
const charge = await stripe.charges.create({
  amount: Math.round(amount * 100),
  currency: 'brl',
  source: token,
});
```

### Secrets/Keys

Never commit:
```bash
# ❌ Errado
const STRIPE_KEY = "sk_live_123abc";

# ✅ Correto
const STRIPE_KEY = process.env.STRIPE_API_KEY;
```

---

## ADR-004: Estrutura Memory 10-Níveis

**Status**: Accepted  
**Date**: 2024-01-15  

### Decision

Usar estrutura de memory com 10 níveis para rastreabilidade de contexto:

```
00-global   → Estratégia
10-product  → Requisitos
20-architecture → Design
30-domains  → Por bounded domain
40-delivery → Roadmap
50-orchestration → Agentes
60-runs     → Logs
70-summaries → Resumos
80-data     → Schemas
90-decisions → ADRs
```

### Rationale

- ✅ Fácil onboarding de novos devs
- ✅ Rastreabilidade de decisões
- ✅ Escalável para multi-agentes (future)

---

## ADR-005: Versionamento de API

**Status**: Accepted  
**Date**: 2024-01-15  

### Decision

```
GET /api/v1/products ← v1 agora
GET /api/v2/products ← Futuro se breaking changes
```

### Rationale

- ✅ Backward compatibility
- ✅ Clientes legados podem continuar em v1
- ✅ Migração gradual

---

## Como Adicionar Novas ADRs

1. Criar arquivo: `90-decisions/ADR-XXX.md`
2. Usar template acima
3. Incluir Status, Date, Context, Decision
4. Descrever Rationale e Consequences
5. Link em 00-global/context-index.md

## Queries Frequentes

```sql
-- Verificar tamanho do banco
SELECT pg_size_pretty(pg_database_size('ecommerce'));

-- Verificar conexões ativas
SELECT count(*) FROM pg_stat_activity;

-- Verificar queries lentas
SELECT query, mean_time FROM pg_stat_statements WHERE mean_time > 100;
```
