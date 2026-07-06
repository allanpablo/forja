# NFRs - Non-Functional Requirements

## 1. Performance

### Response Times (p99)

| Endpoint | Target |
|----------|--------|
| /api/auth/login | < 200ms |
| /api/subscriptions | < 150ms |
| /api/billing | < 300ms |
| /api/users | < 100ms |
| Health check | < 50ms |

### Database Query Performance

- Simple queries: < 50ms
- Complex queries (joins): < 200ms
- Aggregations: < 1s
- Indexes: On every foreign key + filtering column

### Throughput

- 1000 concurrent users: No degradation
- 10k requests/min: No errors
- Database connections: Pool of 20 (adjust per load test)
- Cache hit rate: > 80% for subscription data

---

## 2. Scalability

### Horizontal Scaling

- Stateless API: Deploy multiple instances
- Load balancer: Round-robin or sticky sessions
- Cache layer: Redis for session/subscription data
- Database: Single PostgreSQL, upgrade to RDS eventually

### Database Scaling Strategy

**Phase 1** (0-100k users): Single PostgreSQL instance
**Phase 2** (100k-1M users): RDS Multi-AZ + read replicas
**Phase 3** (1M+ users): Sharding by tenant_id

### Vertical Scaling Limits

- Memory: Start with 2GB, monitor
- CPU: Start with 2 cores, scale to 8
- Disk: Start with 100GB, add SSD

---

## 3. Reliability & Availability

### Uptime Target

- Production: 99.9% SLA (43 min downtime/month)
- Staging: 95% (no SLA)
- Development: No guarantee

### Fault Tolerance

- Database failure: Immediate alert, manual failover
- API failure: Health check detects in 30s, auto-restart
- Payment gateway failure: Retry logic + fallback to mock
- Cache failure: Graceful degradation, no cache needed

### Error Recovery

- Transient errors (500): Retry 3x with exponential backoff
- Permanent errors (400): Fail immediately, log for debugging
- Timeout: 30s default, 60s for webhooks

### Data Durability

- Database backups: Daily, retained 30 days
- WAL archiving: Enabled
- Recovery: Restore to 24h ago in <30min
- RPO (Recovery Point Objective): 1 day
- RTO (Recovery Time Objective): 30 minutes

---

## 4. Security

### Threat Vectors & Mitigations

| Threat | Mitigation | Implemented |
|--------|-----------|-----------|
| SQL Injection | Parameterized queries (Typeorm ORM) | ✅ |
| XSS | CSP headers, input validation | 🚧 |
| CSRF | JWT (stateless), no session cookies | ✅ |
| Brute force | Rate limiting 100 req/sec | 🚧 |
| Man-in-the-middle | TLS 1.3, HSTS | 🚧 |
| Privilege escalation | RBAC, JWT validation | ✅ |
| Data breach | Encryption in transit, PII redaction | ✅ |
| Denial of service | Rate limiting, query timeouts | 🚧 |

### Cryptography

- Password hashing: bcrypt, cost=12
- JWT signing: HS256, secret from env
- Token rotation: No (JWT is stateless)
- API keys: SHA-256 hash in database
- Secrets in env: Never in code or git

### Authentication & Authorization

- Multi-factor auth: Not in MVP (hook for future)
- Session timeout: 15 min (access token)
- Password reset: Email link, 24h expiry
- Account lockout: After 5 failed attempts (15 min)

---

## 5. Maintainability

### Code Quality

- Language: TypeScript strict mode (no `any`)
- Linting: ESLint + Prettier, enforced in CI
- Testing: Unit (50%+), E2E (30%+), Coverage >60%
- Code reviews: Every PR requires 1 approval
- Documentation: JSDoc on public methods

### Deployment

- CI/CD: GitHub Actions
- Deployment: Blue-green or canary
- Rollback: Automatic on health check failure
- Configuration: 12-factor app (env vars only)

### Observability

- Logging: JSON, structured logging with levels
- Metrics: Prometheus scrape endpoint
- Tracing: OpenTelemetry hooks (not mandatory)
- Monitoring: Alert on >1% error rate

### Version Control

- Git flow: main (prod) ← staging ← feature branches
- Commit messages: Conventional commits
- Tags: Semantic versioning (v1.0.0)
- Release notes: Changelog per version

---

## 6. Compliance

### Regulatory

- GDPR: Compliant (data export, deletion, consent)
- CCPA: Compliant (opt-out, data requests)
- SOC2 Type I: Audit trail, access controls
- HIPAA: Not required for MVP

### Data Protection

- Data at rest: Application-level encryption (not DB encryption)
- Data in transit: TLS 1.3 mandatory
- PII classification: Email, password, name
- Retention: 90 days for logs, 1 year for deleted orgs

### Audit & Logging

- User actions: Logged (create, update, delete)
- Admin actions: Logged with timestamp + user
- Failed auth: Logged but rate-limited (prevent log spam)
- Access patterns: No personal data, just metrics

---

## 7. Usability

### Developer Experience

- Setup time: < 10 minutes
- Deploy time: < 5 minutes
- Learning curve: Existing NestJS developers +1 day
- Error messages: Clear, actionable, no stack traces in production

### API Usability

- Consistency: RESTful with HTTP verbs
- Discoverability: Swagger/OpenAPI docs
- Error handling: Standard HTTP status codes + error codes
- Pagination: Limit + offset, max 100 items
- Filtering: Query params, escapable

### Documentation

- README: Quick start, examples, architecture
- API docs: Swagger endpoint at /api/docs
- Patterns: memory/00-global/patterns.md
- Examples: Postman collection provided

---

## 8. Cost Optimization

### Infrastructure

- Database: PostgreSQL (cheaper than DynamoDB)
- Cache: Redis (cheaper than ElastiCache for small scale)
- CDN: Not needed (API only)
- Monitoring: Open-source tools (Prometheus, Grafana)

### Development

- No vendor lock-in (can migrate to AWS/GCP/Azure)
- OSS stack: NestJS, Typeorm, Jest (no expensive licenses)
- Cost tracking: Budget alerts in cloud provider

---

## 9. Cross-Cutting Concerns

### Monitoring & Alerting

- CPU > 80%: Scale up
- Memory > 85%: Investigate leak
- Error rate > 1%: Page on-call
- Database connections > 18/20: Page on-call
- Response time p99 > 1s: Investigate

### Incident Response

- Severity 1 (total outage): 15 min response
- Severity 2 (partial outage): 1 hour response
- Severity 3 (degradation): 4 hours response
- Severity 4 (minor issue): Next business day

### SLA Remedies

- 99.5-99.9%: 10% credit
- 99-99.5%: 25% credit
- <99%: 50% credit (or full refund)
