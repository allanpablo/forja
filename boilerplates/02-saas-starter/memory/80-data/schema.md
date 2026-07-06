# Database Schema

## Entities & Relationships

```
Organization (1) ──→ (Many) User
Organization (1) ──→ (1) Subscription
Organization (1) ──→ (Many) Invoice
Subscription (1) ──→ (Many) Invoice
User (1) ──→ (Many) Audit Log
```

## Entity: Organization

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantId UUID NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  ownerUserId UUID NOT NULL REFERENCES users(id),
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  stripeCustomerId VARCHAR(255),
  createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
  deletedAt TIMESTAMP
);

CREATE INDEX idx_org_tenant ON organizations(tenantId);
CREATE INDEX idx_org_owner ON organizations(ownerUserId);
```

## Entity: User

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantId UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  passwordHash VARCHAR(255),
  firstName VARCHAR(100),
  lastName VARCHAR(100),
  roles VARCHAR(50)[] DEFAULT ARRAY['member'],
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  emailVerifiedAt TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
  deletedAt TIMESTAMP,
  CONSTRAINT fk_user_tenant FOREIGN KEY (tenantId) REFERENCES organizations(tenantId)
);

CREATE INDEX idx_user_tenant_email ON users(tenantId, email);
CREATE INDEX idx_user_tenant_status ON users(tenantId, status);
CREATE UNIQUE INDEX idx_user_unique_email ON users(tenantId, email) WHERE deletedAt IS NULL;
```

## Entity: Subscription

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizationId UUID NOT NULL REFERENCES organizations(id),
  tenantId UUID NOT NULL,
  plan VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  currentPeriodStart TIMESTAMP NOT NULL,
  currentPeriodEnd TIMESTAMP NOT NULL,
  cancelAtPeriodEnd BOOLEAN DEFAULT FALSE,
  cancelledAt TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_sub_tenant FOREIGN KEY (tenantId) REFERENCES organizations(tenantId)
);

CREATE INDEX idx_sub_org ON subscriptions(organizationId);
CREATE INDEX idx_sub_tenant ON subscriptions(tenantId);
CREATE INDEX idx_sub_status ON subscriptions(tenantId, status);
```

## Entity: Invoice

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizationId UUID NOT NULL REFERENCES organizations(id),
  tenantId UUID NOT NULL,
  invoiceNumber VARCHAR(50) NOT NULL UNIQUE,
  subscriptionId UUID REFERENCES subscriptions(id),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  description TEXT,
  items JSONB,
  issuedAt TIMESTAMP NOT NULL,
  dueDate TIMESTAMP,
  paidAt TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_invoice_tenant FOREIGN KEY (tenantId) REFERENCES organizations(tenantId)
);

CREATE INDEX idx_inv_org ON invoices(organizationId);
CREATE INDEX idx_inv_tenant ON invoices(tenantId);
CREATE INDEX idx_inv_status ON invoices(tenantId, status);
```

## Entity: Payment Transaction

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizationId UUID NOT NULL REFERENCES organizations(id),
  tenantId UUID NOT NULL,
  invoiceId UUID REFERENCES invoices(id),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  paymentMethodId VARCHAR(255),
  stripePaymentIntentId VARCHAR(255),
  description TEXT,
  failureReason TEXT,
  retryCount INT DEFAULT 0,
  nextRetryAt TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_txn_tenant FOREIGN KEY (tenantId) REFERENCES organizations(tenantId)
);

CREATE INDEX idx_txn_org ON transactions(organizationId);
CREATE INDEX idx_txn_tenant ON transactions(tenantId);
CREATE INDEX idx_txn_invoice ON transactions(invoiceId);
CREATE INDEX idx_txn_status ON transactions(tenantId, status);
```

## Entity: Audit Log

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantId UUID NOT NULL,
  userId UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100) NOT NULL,
  entityId UUID,
  changes JSONB,
  ipAddress INET,
  userAgent TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenantId) REFERENCES organizations(tenantId)
);

CREATE INDEX idx_audit_tenant ON audit_logs(tenantId);
CREATE INDEX idx_audit_user ON audit_logs(userId);
CREATE INDEX idx_audit_action ON audit_logs(action);
```

## Entity: API Key (Future)

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizationId UUID NOT NULL REFERENCES organizations(id),
  tenantId UUID NOT NULL,
  keyHash VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  lastUsedAt TIMESTAMP,
  expiresAt TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
  revokedAt TIMESTAMP,
  CONSTRAINT fk_apikey_tenant FOREIGN KEY (tenantId) REFERENCES organizations(tenantId)
);

CREATE INDEX idx_apikey_org ON api_keys(organizationId);
CREATE INDEX idx_apikey_hash ON api_keys(keyHash);
```

## Constraints & Rules

- Every table has `tenantId` for isolation
- Foreign keys enforce referential integrity
- Soft deletes with `deletedAt`
- Timestamps: `createdAt`, `updatedAt` on every table
- Indexes on every foreign key + filtering column
- Unique constraints on business keys (email, invoiceNumber, etc)
