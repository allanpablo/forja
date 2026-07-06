# Product Backlog

## P0 - Critical (Sprint 1-2)

- [ ] **Setup**: PostgreSQL + Redis docker-compose
- [ ] **Auth**: JWT login/signup/refresh
- [ ] **Organizations**: Multi-tenant isolation
- [ ] **Users**: RBAC (owner, admin, member)
- [ ] **Subscriptions**: CRUD endpoints, plan validation
- [ ] **Billing**: Mock Stripe, invoice generation
- [ ] **Testing**: E2E tests for core flows
- [ ] **Documentation**: README, patterns, API docs

## P1 - High (Sprint 3-4)

- [ ] **Subscriptions**: Annual plans with 20% discount
- [ ] **Billing**: Retry logic for failed payments
- [ ] **Email**: Integration hooks for confirmation emails
- [ ] **Observability**: Structured JSON logging
- [ ] **Rate limiting**: Per-tenant + per-endpoint
- [ ] **Error handling**: Standardized error responses
- [ ] **Dashboard**: Metrics for MRR, churn, ARR
- [ ] **Database**: Indexes on all queries

## P2 - Medium (Q2)

- [ ] **Stripe**: Real payment integration
- [ ] **Webhooks**: Payment event handlers
- [ ] **Compliance**: GDPR data export
- [ ] **Audit**: Audit logging for user actions
- [ ] **Analytics**: Event tracking infrastructure
- [ ] **Performance**: Query optimization, caching
- [ ] **Monitoring**: Prometheus + Grafana
- [ ] **Tracing**: OpenTelemetry integration

## P3 - Low (Q3-Q4)

- [ ] **Multi-currency**: USD, EUR, GBP support
- [ ] **Tax**: Sales tax, VAT calculation
- [ ] **PDF**: Invoice PDF generation
- [ ] **MFA**: Multi-factor authentication
- [ ] **SSO**: SAML/OAuth integration
- [ ] **Mobile**: SDK for mobile apps
- [ ] **Internationalization**: i18n for UI
- [ ] **Performance**: Load testing, CDN

## Dependencies

- Setup must complete before Auth
- Auth must complete before Subscriptions
- Subscriptions must complete before Billing
- Core modules must complete before Analytics

## Known Issues

| Issue | Priority | Status |
|-------|----------|--------|
| None yet | - | - |

## Technical Debt

| Item | Sprint | Est. Hours |
|------|--------|-----------|
| Add integration tests | Sprint 3 | 4 |
| Refactor service layer | Sprint 4 | 6 |
| Database index optimization | Sprint 4 | 3 |

## Capacity Planning

- Team size: 1-3 engineers
- Velocity: 5-8 points/sprint
- Sprints per quarter: 12
- Total Q1 capacity: 60-96 points

## Prioritization Framework

1. **Frequency**: High-frequency features first (auth used every request)
2. **Risk**: High-risk features early (multi-tenant isolation)
3. **Dependencies**: Blockers before blocked
4. **Business value**: Revenue-impacting features (subscriptions, billing)
5. **Technical quality**: Testing, docs, patterns (for maintainability)
