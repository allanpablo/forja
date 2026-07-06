# 📜 Agent Contract

## Service Mesh Topology
Todos os agentes (serviços) operam dentro de um service mesh com as seguintes garantias:

### Availability Guarantees
- **Auth Service**: 99.9% uptime (critical path)
- **User Service**: 99.5% uptime
- **Notification Service**: 99% uptime (non-blocking)

### Latency SLAs
- Auth operations: p99 < 100ms
- User CRUD: p99 < 200ms
- Notifications: p99 < 500ms (async acceptable)

---

## Service Responsibilities

### Auth Service (port 3001)
**Propriedade:** Autenticação, autorização, token management
- ✅ OAuth2 flow
- ✅ JWT generation & validation
- ✅ Password hashing (bcrypt)
- ✅ Session management
- ❌ NÃO gerencia dados de usuário

**APIs:**
```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/verify
GET    /auth/health
```

---

### User Service (port 3002)
**Propriedade:** Perfis de usuário, dados pessoais, preferências
- ✅ User profile management
- ✅ Email verification
- ✅ Profile pictures
- ✅ User preferences
- ❌ NÃO autentica (delegado a auth-service)
- ❌ NÃO envia notificações diretamente

**APIs:**
```
GET    /users/:id
POST   /users
PATCH  /users/:id
DELETE /users/:id
GET    /users/:id/profile
POST   /users/:id/verify-email
GET    /health
```

---

### Notification Service (port 3003)
**Propriedade:** Envio de notificações (email, push, SMS)
- ✅ Email sending (via provider ou mock)
- ✅ Push notifications
- ✅ Event-driven processing
- ✅ Retry logic para falhas
- ❌ NÃO autentica requisições
- ❌ NÃO consome user data diretamente

**APIs:**
```
POST   /notifications/email
POST   /notifications/push
GET    /notifications/:id/status
GET    /health
```

---

## Communication Contract

### Request Format
```typescript
interface ServiceRequest {
  requestId: string;          // X-Request-Id
  correlationId: string;      // X-Correlation-Id
  userId?: string;            // X-User-Id
  Authorization: string;      // Bearer token
  timestamp: ISO8601;
  body: any;
}
```

### Response Format
```typescript
interface ServiceResponse<T> {
  statusCode: number;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  meta: {
    requestId: string;
    timestamp: ISO8601;
    processingTime: number; // ms
  };
}
```

---

## Event Publishing Contract

### Event Structure
```typescript
interface DomainEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  timestamp: ISO8601;
  version: number;
  data: Record<string, any>;
  metadata: {
    userId?: string;
    correlationId: string;
    source: 'auth-service' | 'user-service' | 'notification-service';
  };
}
```

### Event Routing
```
auth-service publishes:
  - user.created
  - user.authenticated
  - password.reset_requested

user-service publishes:
  - user.profile_updated
  - user.email_verified
  - user.deleted

notification-service publishes:
  - notification.sent
  - notification.failed
```

---

## Deployment & Scaling

### Horizontal Scaling
- Each service can scale independently
- Load balancer routes to multiple instances
- Session affinity NOT required (stateless)

### Rolling Deployment
- Zero-downtime updates supported
- Health checks verify readiness
- Automatic rollback on failure

### Resource Limits
```
auth-service:     CPU 0.5, Memory 512MB
user-service:     CPU 0.5, Memory 512MB
notification-svc: CPU 0.25, Memory 256MB
api-gateway:      CPU 0.25, Memory 256MB
```
