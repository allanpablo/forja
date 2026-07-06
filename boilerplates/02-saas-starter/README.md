# SaaS Starter - Multi-Tenant Platform Boilerplate

**Production-ready NestJS + PostgreSQL + Redis** scaffold for launching SaaS in weeks, not months.

## Features

✅ **Multi-Tenant Architecture** — Secure data isolation, tenant-per-database-row pattern  
✅ **Authentication** — JWT-based with refresh tokens, local + passport strategies  
✅ **RBAC** — Owner, Admin, Member roles with permission matrix  
✅ **Subscription Management** — Free, Pro, Enterprise plans with smart transitions  
✅ **Billing** — Mock Stripe payment gateway with invoices & transactions  
✅ **Type-Safe** — 100% TypeScript, strict mode, no `any`  
✅ **Well-Documented** — 10-level memory structure, API specs, patterns  
✅ **Agent-Ready** — Designed for multi-agent orchestration  
✅ **Docker-Compose** — Local development in 1 command  
✅ **E2E Tests** — Happy-path scenarios for critical flows  

## Quick Start

```bash
# 1. Enter directory
cd boilerplates/02-saas-starter

# 2. Install dependencies
npm install

# 3. Start database & cache
docker-compose up -d

# 4. Configure environment
cp .env.example .env.local

# 5. Run server
npm run start:dev

# 6. Open API docs
# http://localhost:3000/api/docs
```

**That's it!** Server running on `localhost:3000`.

## API Examples

### Signup (Create Org + User)

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "founder@example.com",
    "password": "SecureP@ss123",
    "organizationName": "My SaaS"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login-email \
  -H "Content-Type: application/json" \
  -d '{ "email": "founder@example.com", "password": "SecureP@ss123" }'
```

### Get Current User

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer {accessToken}"
```

### Upgrade Subscription

```bash
curl -X POST http://localhost:3000/api/subscriptions/{id}/upgrade \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{ "newPlan": "pro" }'
```

### Process Payment (Mock)

```bash
curl -X POST http://localhost:3000/api/billing/charge \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{ "amount": 99.00, "description": "Pro Plan" }'
```

See [QUICK_START.md](./QUICK_START.md) for more examples.

## Architecture

```
┌─────────────────────────┐
│   NestJS Controllers    │  (HTTP endpoints)
├─────────────────────────┤
│   Services              │  (Business logic)
├─────────────────────────┤
│   Repositories          │  (Data access)
├─────────────────────────┤
│   PostgreSQL + Redis    │  (Persistence)
└─────────────────────────┘
```

**Multi-Tenant**: Every table has `tenantId` column. All queries filtered by tenant.  
**RBAC**: Roles stored in User entity, checked via RolesGuard decorator.  
**JWT**: Stateless auth, 15min access token, 7day refresh token.  

## Project Structure

```
backend/
├── src/
│   ├── modules/
│   │   ├── auth/         (JWT, login, signup)
│   │   ├── users/        (RBAC, user management)
│   │   ├── organizations/(Multi-tenant)
│   │   ├── subscriptions/(Plans, upgrades)
│   │   └── billing/      (Invoices, payments mock)
│   ├── common/
│   │   ├── decorators/   (Roles, TenantId)
│   │   ├── middleware/   (Guards, logging)
│   │   └── filters/      (Error handling)
│   ├── config/           (Database, JWT)
│   ├── app.module.ts
│   └── main.ts
├── test/                 (E2E tests)
├── package.json
└── tsconfig.json

memory/                    (Documentation)
├── 00-global/           (Mission, patterns, policies)
├── 10-product/          (Vision, personas, rules)
├── 20-architecture/     (Tech decisions, diagrams)
├── 30-domains/          (Auth, subscriptions, billing)
├── 40-delivery/         (Roadmap, sprints, backlog)
├── 50-orchestration/    (Agent topology, handoffs)
├── 60-runs/             (Execution logs)
├── 70-summaries/        (Executive summaries)
├── 80-data/             (Database schema)
└── 90-decisions/        (ADRs)

docker-compose.yml       (PostgreSQL + Redis)
.env.example            (Configuration template)
QUICK_START.md          (5-minute setup guide)
```

## Database Schema

**Entities**:
- `User` — Email, roles, tenant isolation
- `Organization` — Plan, tenant ID, owner
- `Subscription` — Current plan, billing period
- `Invoice` — Charges, payment status
- `AuditLog` — User actions, compliance

See [memory/80-data/schema.md](./memory/80-data/schema.md).

## Authentication Flow

1. **Signup**: User + Org created, JWT tokens returned
2. **Login**: Email + password validated, tokens returned
3. **Protected routes**: JWT header validated, tenant extracted
4. **Logout**: Token cached in Redis for blacklist (future)

Strategies:
- **Local**: Username/password (Passport Local)
- **JWT**: Bearer token (Passport JWT)

## Subscription Plans

| Plan | Price | API Calls | Storage | Users |
|------|-------|-----------|---------|-------|
| Free | $0 | 1k/mo | 1GB | 1 |
| Pro | $99 | 100k/mo | 100GB | 5 (+$10 each) |
| Enterprise | Custom | ∞ | ∞ | ∞ |

Upgrade instantly, downgrade at period end. Pro-rata billing for mid-cycle changes.

## Payment (Mock)

90% success rate, 10% failure (for testing). Real Stripe integration in Q2.

```typescript
POST /api/billing/charge
{
  "amount": 99.00,
  "description": "Pro Plan Upgrade"
}
```

Returns invoice with mock transaction ID.

## Development

```bash
# Format + Lint
npm run format && npm run lint

# Tests
npm run test              # Unit
npm run test:cov          # Coverage
npm run test:e2e          # E2E

# Build
npm run build
npm run start:prod
```

## Environment Variables

```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=saas_starter
JWT_SECRET=dev-secret-key
JWT_REFRESH_SECRET=dev-refresh-secret
```

See [.env.example](./.env.example) for all options.

## Documentation

- **Quick Start**: [QUICK_START.md](./QUICK_START.md)
- **API Reference**: [memory/30-domains/](./memory/30-domains/)
- **Architecture**: [memory/20-architecture/overview.md](./memory/20-architecture/overview.md)
- **Patterns & Conventions**: [memory/00-global/patterns.md](./memory/00-global/patterns.md)
- **Business Rules**: [memory/10-product/business-rules.md](./memory/10-product/business-rules.md)
- **Database Schema**: [memory/80-data/schema.md](./memory/80-data/schema.md)

**Navigation**: See [memory/00-global/index.md](./memory/00-global/index.md) for full index.

## Roadmap

**Q1 2024** (Current): MVP with auth, subscriptions, billing mock ✅  
**Q2 2024**: Real Stripe, webhooks, analytics  
**Q3 2024**: Observability, compliance, performance  
**Q4 2024**: Multi-currency, internationalization  

See [memory/40-delivery/roadmap.md](./memory/40-delivery/roadmap.md).

## Extending

### Add a New Endpoint

1. Create DTO in `modules/{domain}/dto/`
2. Add method in `modules/{domain}/{domain}.service.ts`
3. Add route in `modules/{domain}/{domain}.controller.ts`
4. Add tests in `test/{domain}.e2e-spec.ts`
5. Document in `memory/30-domains/{domain}/api.md`

See [memory/00-global/patterns.md](./memory/00-global/patterns.md).

### Add a New Module

1. Create folder in `modules/`
2. Create `{module}.service.ts`, `{module}.controller.ts`, `{module}.module.ts`
3. Add module to `app.module.ts` imports
4. Create `entity.ts` and register in database config
5. Document in `memory/30-domains/{module}/`

## Security

- **Passwords**: Bcrypt cost=12
- **JWT**: HS256, secrets in env
- **Tenant Isolation**: Row-level filtering by tenantId
- **SQL Injection**: TypeORM parameterized queries
- **RBAC**: Roles decorator on controllers
- **PII**: No passwords/tokens in logs

See [memory/10-product/nfrs.md](./memory/10-product/nfrs.md) for security requirements.

## Troubleshooting

**Port 3000 in use?**
```bash
lsof -i :3000 && kill -9 {PID}
```

**Database connection failed?**
```bash
docker-compose ps
docker-compose logs postgres
```

**Module not found?**
```bash
rm -rf node_modules && npm install
```

## License

MIT

## Contributing

Patches welcome! See [memory/00-global/agent-contract.md](./memory/00-global/agent-contract.md) for agent onboarding.

---

**Ready to build?** See [QUICK_START.md](./QUICK_START.md) →
