# Visão Geral da Arquitetura

## Diagrama da Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         Cliente Web/Mobile                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                         API Gateway                              │
│  (Rate Limiter, CORS, Request Logging)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      NestJS Application                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Controllers  │  Services  │  Middleware  │  Guards      │  │
│  ├──────────────┴────────────┴──────────────┴──────────────┤  │
│  │  Modules:                                                │  │
│  │  • Auth (JWT, Local strategy)                            │  │
│  │  • Users (RBAC, invites)                                 │  │
│  │  • Organizations (Multi-tenant)                          │  │
│  │  • Subscriptions (Plans, upgrades)                       │  │
│  │  • Billing (Payments, invoices)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                     │                      │
              ┌──────┴──────┬──────────────┬┴────────┐
              ↓             ↓              ↓         ↓
        ┌──────────┐ ┌─────────┐  ┌──────────┐  ┌────────┐
        │PostgreSQL│ │  Redis  │  │ Payment  │  │ Email  │
        │ Database │ │  Cache  │  │ Gateway  │  │Service │
        │          │ │         │  │ (Mock)   │  │(Hooks) │
        └──────────┘ └─────────┘  └──────────┘  └────────┘
```

## Stack Técnico

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| **Backend** | NestJS | 10+ |
| **Language** | TypeScript | 5.0+ |
| **Database** | PostgreSQL | 15+ |
| **Cache** | Redis | 7.0+ |
| **ORM** | TypeORM | 0.3+ |
| **Auth** | JWT | HS256 |
| **Testing** | Jest | 29+ |
| **API Docs** | Swagger/OpenAPI | 3.0 |
| **Runtime** | Node.js | 18+ LTS |

## Módulos Principais

### 1. Auth Module
- JWT strategy (access + refresh)
- Local strategy (username/password)
- Password hashing (bcrypt)
- Token validation & expiry

### 2. Users Module
- User CRUD (create, read, update, delete)
- RBAC (role assignment, permission checking)
- User invites (email link)
- Profile management

### 3. Organizations Module
- Org CRUD (create, read, update, delete)
- Org settings
- Multi-tenant isolation
- Org-level permissions

### 4. Subscriptions Module
- Subscription CRUD
- Plan management (free, pro, enterprise)
- Upgrade/downgrade logic
- Billing integration

### 5. Billing Module
- Payment processing (mock)
- Invoice generation
- Webhook handling
- Transaction history

## Fluxos Principais

### Signup Flow
```
1. POST /api/auth/signup { email, password, org_name }
2. Validar email único + força de senha
3. Hash password com bcrypt
4. Criar org + user (owner role)
5. Gerar JWT access token
6. Enviar email de confirmação (async)
7. Retornar token + user data
```

### Subscription Upgrade Flow
```
1. GET /api/subscriptions (validar tenant, auth)
2. POST /api/subscriptions/:id/upgrade { plan_id }
3. Validar transição de plano
4. Charge payment (mock)
5. Atualizar subscription
6. Gerar invoice
7. Registrar audit log
8. Enviar email de confirmação
```

### Billing Flow
```
1. POST /api/billing/charge { amount, currency }
2. Chamar payment gateway (Stripe mock)
3. Registrar transação
4. Gerar invoice
5. Enviar email de receipt
6. Webhook callback (async)
7. Atualizar subscription status se necessário
```

## Padrões Arquiteturais

### 1. Dependency Injection
- NestJS @Injectable()
- Constructor injection (explícito, type-safe)
- Service-to-service via providers

### 2. Middleware Pattern
- Tenant context middleware (set tenantId no request)
- Logging middleware
- Error handling middleware

### 3. Guard Pattern
- JwtAuthGuard (validar token)
- RolesGuard (verificar RBAC)
- TenantGuard (isolar tenant)

### 4. Service Pattern
- Business logic separado de HTTP
- Reutilizável por controllers/jobs
- Testável isoladamente

### 5. Repository Pattern
- Typeorm repositories para data access
- Abstração de queries
- Facilitado testes (mock repositories)

## Camadas

```
┌───────────────────────────────┐
│  HTTP Controllers             │  (Request/Response)
├───────────────────────────────┤
│  Services                     │  (Business Logic)
├───────────────────────────────┤
│  Repositories                 │  (Data Access)
├───────────────────────────────┤
│  Database / Cache             │  (Persistence)
└───────────────────────────────┘
```

## Decisões Arquiteturais

### Por que PostgreSQL, não MongoDB?
- Relational: Users ↔ Organizations ↔ Subscriptions ↔ Invoices
- Transactions: ACID para billing (crítico)
- Compliance: Melhor para GDPR + audit trails
- Cost: Managed PostgreSQL (RDS, Heroku) é mais barato

### Por que Redis, não memcache?
- Data structures: Listas, sets (cache invalidation mais fácil)
- Persistence: Opcional, mas disponível
- Pub/Sub: Para notificações em tempo real (futura)
- Cost: Comparable, Redis tem mais features

### Por que TypeScript?
- Type safety: Detectar bugs em compile-time
- DX: Melhor IDE support, autocompletion
- Refactoring: Renomear símbolos com confiança
- Migration: JavaScript é subset de TypeScript

### Por que NestJS?
- Convention over configuration: Setup rápido
- Dependency injection: Integrado desde início
- Modular: Escalável conforme projeto cresce
- Testing: Built-in testing utilities
- Community: Stack MEAN maduro em produção

## Próximas Fases

### Phase 2: Internacionalização
- Multi-currency (USD, EUR, GBP, etc)
- Stripe real integration
- Webhooks para payment events

### Phase 3: Observability
- Prometheus metrics
- Grafana dashboards
- OpenTelemetry tracing
- Distributed logging (ELK stack)

### Phase 4: Compliance
- SOC2 audit trail
- GDPR data export
- User audit logs
- Rate limiting per endpoint

### Phase 5: Performance
- Database indexes optimization
- Query result caching
- Bulk operations
- Webhook batch processing

## Deployment Strategy

### Development Environment
- docker-compose com PostgreSQL + Redis
- Hot-reload NestJS
- Seed data automático

### Staging Environment
- AWS RDS PostgreSQL
- AWS ElastiCache Redis
- Docker containers em ECS
- Blue-green deployment

### Production Environment
- Multi-AZ RDS PostgreSQL
- Read replicas para scaling
- CloudFront para static assets (future)
- Auto-scaling groups
