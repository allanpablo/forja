# Regras de Negócio

## 1. Subscription Plans

### Planos Padrão

| Plan | Price/mo | Users | API Calls | Storage | Support |
|------|----------|-------|-----------|---------|---------|
| **Free** | $0 | 1 | 1k/mo | 1GB | Community |
| **Pro** | $99 | 5 | 100k/mo | 100GB | Email |
| **Enterprise** | Custom | Unlimited | Unlimited | Unlimited | Dedicated |

### Regras de Transição

**Upgrade:**
- Free → Pro: Imediato, prorated charge
- Pro → Enterprise: Requer aprovação
- Any → Any: Sem penalty

**Downgrade:**
- Pro → Free: Imediato, credit note
- Downgrade gera refund pro-rata
- Cannot downgrade mid-commitment (annual plans)

**Effective Date:**
- Upgrade: Imediato
- Downgrade: Fim da billing cycle
- Já-paid: Pro-rata adjustment

### Limits & Quotas

- Free: 1k API calls/mo (soft), 1GB storage (hard)
- Pro: 100k API calls/mo (soft), 100GB storage (hard)
- Enterprise: Unlimited
- Rate limiting: 100 req/sec per tenant

**What happens at limit?**
- Soft limit: Warning email, continue working
- Hard limit: 429 Too Many Requests, suggest upgrade

---

## 2. Billing

### Invoice Schedule

- Monthly subscription: Charge first day of month
- Annual subscription: Charge on anniversary
- Pro-rata charges: Immediate
- Failed charge: Retry 3x over 14 days, then cancel

### Payment Terms

- Credit card: Charge immediately
- Annual discount: 20% (e.g., Pro $1188/year = $99/mo)
- No long-term contracts (SaaS, not enterprise software)
- Money-back guarantee: 14 days

### Refund Policy

- Within 14 days: Full refund
- After 14 days: Pro-rata refund (unused balance)
- Chargeback: Suspend account immediately
- Refund issued within 5-7 business days

### Tax

- US: Sales tax calculated by state (Stripe does this)
- EU: VAT applied, reverse charge for B2B
- Exempt: Non-profits (certificate required)

---

## 3. Users & Roles

### RBAC Matrix

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| Create org | ✅ | ❌ | ❌ |
| Delete org | ✅ | ❌ | ❌ |
| Change plan | ✅ | ❌ | ❌ |
| Invite user | ✅ | ✅ | ❌ |
| Remove user | ✅ | ✅ | ❌ |
| Change role | ✅ | ❌ | ❌ |
| View billing | ✅ | ✅ | ❌ |
| Use API | ✅ | ✅ | ✅ |

### User Lifecycle

```
Invite → Pending → Accepted → Active → Removed/Suspended
```

**Rules:**
- Owner is permanent, cannot be removed
- Min 1 owner per org, max 3 (governance)
- Invitation expires in 7 days
- Removed user: Access revoked immediately, no refund
- Suspended user: Access disabled, but data retained

### Seat Usage

- Free: 1 user
- Pro: 5 seats included, $10 per additional
- Enterprise: Unlimited

**Calculation:**
```
Monthly bill = Subscription + (Overage seats × $10)
```

---

## 4. Multi-Tenancy

### Organization Isolation

Every request must include:
- `Authorization: Bearer {jwt}`
- JWT contains `tenantId`
- Query filters by `tenantId` automatically
- Cross-tenant queries: FORBIDDEN

### Tenant Context Rules

1. **Mandatory**: Every endpoint must validate tenant
2. **Implicit**: Service methods receive tenantId via middleware
3. **Defensive**: Never trust client-provided tenantId
4. **Logged**: All tenant access in audit log

### Data Segregation

- Separate database per tenant: NO (security/ops complexity)
- Row-level security: YES (tenant_id on every table)
- Index on tenant_id: MANDATORY
- Soft-deletes: YES (audit + recovery)

---

## 5. Security

### Password Rules

- Minimum 12 characters
- At least: uppercase + lowercase + number + symbol
- Cannot contain username or email
- Expire: Never (stateless auth)
- History: Not enforced (JWT, not sessions)

### JWT Strategy

- Algorithm: HS256
- Access token: 15 min expiry
- Refresh token: 7 days expiry
- Signing secret: From env, rotated quarterly
- No sensitive data in payload (only id, tenantId, roles)

### Session Handling

- Stateless (no session store)
- Token blacklisting on logout: Cache in Redis, TTL 7 days
- Concurrent sessions: Unlimited per user
- Device limit: Not enforced (SaaS, not mobile app)

### IP Whitelisting

- Enterprise only
- Configure in org settings
- Bypass: Fail-open (if misconfigured, not fail-closed)

---

## 6. Compliance & Data Protection

### GDPR

- Right to access: Export user data in 24h
- Right to delete: Hard-delete after 30 day retention
- Right to portability: JSON export of all data
- Consent: Recorded at signup, audit logged
- DPA required: For EU customers

### Data Retention

- Active org: Keep indefinitely
- Deleted org: Soft-delete, purge after 1 year
- Logs: 90 days (audit), 7 days (debug)
- Backups: 30 day retention

### PII Handling

- Never log passwords, API keys, tokens
- Redact in error messages (e.g., "invalid ***")
- Encrypt at rest: Not mandatory (assume secure infrastructure)
- Encrypt in transit: TLS 1.3, mandatory
- No personal data in CDN

---

## 7. Cancellation & Churn Prevention

### Cancellation Policy

- Self-service: Cancel anytime, effective end of billing cycle
- Data: Accessible for 30 days, then deleted
- Reactivation: Can reactivate within 30 days (restore data)
- Appeal: No manual intervention

### Churn Prevention

- 7 days before expiry: Reminder email
- Failed payment: Retry 3x, then notification
- Downgrade trigger: Send "Why?" survey
- Win-back: No special offers (preserve pricing integrity)

---

## 8. Terms & Policies

### Service Level Agreement (SLA)

- Uptime: 99.9% (monitoring by Pingdom)
- Support: Max 24h response time (Pro tier)
- Incident: Public status page
- Breach: Service credit 10% of monthly fee

### Acceptable Use Policy

- Prohibited: Spam, malware, illegal content, scraping
- Enforcement: Suspension without notice
- Appeal: Customer support, 48h review period
- Serious breach: Permanent termination

### Change Management

- Price changes: 30 days notice
- Feature deprecation: 6 months notice
- Service terms: 30 days notice
- Backwards compatibility: Guaranteed for API v1
