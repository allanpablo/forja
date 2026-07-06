# SaaS Starter - Quick Start Guide

Get your SaaS running in **< 5 minutes**.

## Prerequisites

- Node.js 18+ LTS
- Docker & Docker Compose
- Git

## Setup

### 1. Clone & Install

```bash
cd boilerplates/02-saas-starter
npm install
```

### 2. Start Database & Cache

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Update `.env.local` with your values (or use defaults for development).

### 4. Run Migrations (Future)

```bash
npm run migration:run
```

For now, TypeORM auto-sync creates tables.

### 5. Start Server

```bash
npm run start:dev
```

Server runs on `http://localhost:3000`

## Test the API

### Signup

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "founder@example.com",
    "password": "SecureP@ss123",
    "organizationName": "My Startup"
  }'
```

**Response**:
```json
{
  "data": {
    "user": { "id": "...", "email": "..." },
    "organization": { "id": "...", "name": "...", "plan": "free" },
    "accessToken": "eyJh...",
    "refreshToken": "eyJh..."
  }
}
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "founder@example.com",
    "password": "SecureP@ss123"
  }'
```

### Get Current User

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer {accessToken}"
```

### Get Subscription

```bash
curl -X GET http://localhost:3000/api/subscriptions \
  -H "Authorization: Bearer {accessToken}"
```

### Upgrade Plan

```bash
curl -X POST http://localhost:3000/api/subscriptions/{id}/upgrade \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{ "newPlan": "pro" }'
```

### Create Invoice (Mock Payment)

```bash
curl -X POST http://localhost:3000/api/billing/charge \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 99.00,
    "description": "Pro Plan - January 2024"
  }'
```

## Documentation

- **API Docs**: http://localhost:3000/api/docs (Swagger)
- **Architecture**: [memory/20-architecture/overview.md](./memory/20-architecture/overview.md)
- **Patterns**: [memory/00-global/patterns.md](./memory/00-global/patterns.md)
- **Database Schema**: [memory/80-data/schema.md](./memory/80-data/schema.md)

## Running Tests

```bash
npm run test
npm run test:cov
npm run test:e2e
```

## Development Commands

```bash
# Format code
npm run format

# Lint
npm run lint

# Build
npm run build

# Production
npm run start:prod
```

## Troubleshooting

### Port already in use

```bash
lsof -i :3000
kill -9 {PID}
```

### Database connection failed

```bash
docker-compose ps
docker-compose logs postgres
```

### Module not found errors

```bash
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

1. **Customize**: Extend modules in `backend/src/modules/`
2. **Frontend**: Build React/Vue app, consume `/api/` endpoints
3. **Deploy**: Docker → AWS ECS / Render / Heroku
4. **Real Payments**: Integrate Stripe (see `memory/30-domains/billing/`)
5. **Scale**: Add caching, monitoring, observability

## Documentation Structure

See [memory/00-global/index.md](./memory/00-global/index.md) for navigation.

---

**Need help?** Check the [Architecture](./memory/20-architecture/overview.md) or [API Specs](./memory/30-domains/auth/api.md).
