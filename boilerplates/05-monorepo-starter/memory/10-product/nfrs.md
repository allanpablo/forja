# Non-Functional Requirements

## Performance
- Frontend First Contentful Paint < 2s
- API response times < 200ms (p95)
- Database queries < 100ms
- Build time < 30s (with Turborepo cache)

## Scalability
- Support 10k concurrent users
- Handle 1000 orders/minute during peak
- Database: Vertical scaling up to 100GB

## Security
- All passwords hashed (bcrypt, >10 rounds)
- JWT tokens with 24h expiry
- Refresh tokens stored in secure httpOnly cookies
- CORS enabled only for trusted origins
- API rate limiting (100 req/min per IP)
- SQL injection prevention via ORM/parameterized queries
- HTTPS enforced in production

## Reliability
- 99.9% uptime SLA
- Automated backups (daily)
- Graceful degradation if Redis down
- Health checks every 30s

## Maintainability
- <20% cyclomatic complexity per function
- 80%+ test coverage on business logic
- Shared types reduce API contract bugs
- Clear module boundaries (no circular dependencies)

## Developer Experience
- Setup time < 5 minutes
- Hot reload on code changes (frontend + backend)
- Clear error messages
- Comprehensive docs
