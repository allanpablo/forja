# 🏗️ ARCHITECTURE.md

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL CLIENTS                             │
│               (Web Browser, Mobile App, Desktop CLI)                │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │    API GATEWAY (Port 3000)  │
                    │  ┌────────────────────────┐ │
                    │  │ - Route Dispatcher    │ │
                    │  │ - CORS Enabled        │ │
                    │  │ - Request Logging     │ │
                    │  │ - Error Aggregation   │ │
                    │  └────────────────────────┘ │
                    └────┬─────────────────┬─────┘
                         │                 │
        ┌────────────────▼────┐  ┌────────▼──────────┐
        │  AUTH SERVICE       │  │   USER SERVICE    │
        │  (Port 3001)        │  │   (Port 3002)     │
        │ ┌─────────────────┐ │  │ ┌────────────────┐│
        │ │ Controllers     │ │  │ │ Controllers    ││
        │ │ - register      │ │  │ │ - getProfile   ││
        │ │ - login         │ │  │ │ - updateProfile││
        │ │ - refresh       │ │  │ │ - deleteUser   ││
        │ │ - logout        │ │  │ │ - listUsers    ││
        │ └─────────────────┘ │  │ └────────────────┘│
        │ ┌─────────────────┐ │  │ ┌────────────────┐│
        │ │ Services        │ │  │ │ Services       ││
        │ │ - Auth Logic    │ │  │ │ - Profile Mgmt ││
        │ │ - JWT Tokens    │ │  │ │ - Email Verify ││
        │ │ - Password Hash │ │  │ │ - Settings     ││
        │ └─────────────────┘ │  │ └────────────────┘│
        │ ┌─────────────────┐ │  │ ┌────────────────┐│
        │ │ Persistence     │ │  │ │ Persistence    ││
        │ │ - In-memory map │ │  │ │ - In-memory map││
        │ │   (can be DB)   │ │  │ │   (can be DB)  ││
        │ └─────────────────┘ │  │ └────────────────┘│
        └────────┬──────────┘  └────────┬───────────┘
                 │                      │
        ┌────────▼──────────┐  ┌────────▼──────────┐
        │ PostgreSQL (Auth) │  │PostgreSQL (Users) │
        │ Port: 5432        │  │ Port: 5433        │
        │ DB: auth_db       │  │ DB: users_db      │
        └───────────────────┘  └───────────────────┘
                 │                      │
        ┌────────▼────────────────────┐
        │  NOTIFICATION SERVICE       │
        │  (Port 3003)                │
        │ ┌──────────────────────────┐│
        │ │ Controllers              ││
        │ │ - sendEmail              ││
        │ │ - sendPush               ││
        │ │ - getStatus              ││
        │ │ - listNotifications      ││
        │ └──────────────────────────┘│
        │ ┌──────────────────────────┐│
        │ │ Services                 ││
        │ │ - Email Sending          ││
        │ │ - Push Notifications     ││
        │ │ - Event Consumption      ││
        │ │ - Retry Logic            ││
        │ └──────────────────────────┘│
        └────┬──────────────┬──────────┘
             │              │
    ┌────────▼──────┐  ┌────▼───────────┐
    │ RabbitMQ      │  │ Redis Cache    │
    │ (Port 5672)   │  │ (Port 6379)    │
    │ - user.events │  │ - Sessions     │
    │ - auth.events │  │ - Token cache  │
    │ - sys.events  │  │ - Rate limits  │
    └───────────────┘  └────────────────┘
```

---

## Service Boundaries

### Auth Service (Bounded Context)
**Responsibility:** Authentication and authorization

- ✅ User registration & login
- ✅ Password hashing (bcrypt)
- ✅ JWT token generation
- ✅ Token refresh
- ✅ Token validation
- ✅ Session management
- ❌ User profile data
- ❌ Notification sending

**Database:** PostgreSQL (auth_db)
- Users table
- Refresh tokens table
- Sessions table

**External Dependencies:**
- Redis for token blacklist
- RabbitMQ for event publishing

---

### User Service (Bounded Context)
**Responsibility:** User profiles and settings

- ✅ User profile CRUD
- ✅ Profile settings management
- ✅ Email verification
- ✅ User search/listing
- ❌ Authentication
- ❌ Sending notifications directly

**Database:** PostgreSQL (users_db)
- User profiles table
- User settings table
- Email verification table

**External Dependencies:**
- Auth Service (via API Gateway)
- RabbitMQ for events

---

### Notification Service (Bounded Context)
**Responsibility:** Multi-channel notifications

- ✅ Email sending
- ✅ Push notifications
- ✅ Event-driven processing
- ✅ Retry logic
- ✅ Status tracking
- ❌ User authentication
- ❌ Storing user data

**Storage:** Redis only (no database)
- Notification cache
- Retry counters
- Delivery tracking

**External Dependencies:**
- RabbitMQ for event consumption
- Redis for caching
- Email/Push providers

---

## Communication Patterns

### Synchronous (HTTP REST)

```
Client
  │
  ├─ POST /auth/login
  │   └─► API Gateway
  │       └─► Auth Service
  │
  ├─ GET /users/:id
  │   └─► API Gateway
  │       └─► User Service
  │
  └─ POST /notifications/email
      └─► API Gateway
          └─► Notification Service
```

**Characteristics:**
- Request-response model
- Immediate feedback
- Timeout: 5 seconds (default)
- Retry: Circuit breaker protected

### Asynchronous (Message Queue)

```
Auth Service publishes:
  user.registered
    │
    ├─► User Service consumer
    │   └─ Create profile
    │
    └─► Notification consumer
        └─ Send welcome email
```

**Characteristics:**
- Fire-and-forget
- Loose coupling
- Guaranteed delivery
- Retry on failure
- Event ordering per stream

---

## Data Architecture

### Database Per Service

```
Auth DB (auth_db):
├── users
│   ├─ id (PK)
│   ├─ email (UNIQUE)
│   ├─ password_hash (bcrypt)
│   ├─ status (active/disabled)
│   └─ created_at, updated_at
│
└── refresh_tokens
    ├─ id (PK)
    ├─ user_id (FK)
    ├─ token
    ├─ expires_at
    └─ device_id (optional)

User DB (users_db):
├── user_profiles
│   ├─ user_id (PK, FK → auth_db)
│   ├─ email
│   ├─ full_name
│   ├─ avatar_url
│   ├─ bio
│   ├─ email_verified
│   └─ created_at, updated_at
│
└── user_settings
    ├─ user_id (PK, FK)
    ├─ theme
    ├─ notifications_enabled
    ├─ language
    └─ timezone

Notification Service (Redis):
└── (Stateless - reads from RabbitMQ events)
    ├─ notification:{id} → JSON
    ├─ notification:pending → Queue
    └─ notification:retry_count → Counter
```

**Rationale:**
- Independent scaling
- Technology flexibility
- Deployment isolation
- Eventual consistency

### Caching Strategy

```
Redis:
├── sessions:{sessionId}     (TTL: 24h)
├── user_profile:{userId}    (TTL: 1h)
├── auth_token_blacklist:    (TTL: token expiry)
├── rate_limit:{ip}          (TTL: 1m)
└── notification:pending     (TTL: varies)
```

---

## Request Flow Example

### Example: User Login & Profile Update

```
1. Client POST /auth/login
   │
   ├─► API Gateway receives request
   │   ├─ Generate request ID
   │   ├─ Extract headers
   │   └─ Route to /auth/login
   │
   ├─► Auth Service:
   │   ├─ Validate email/password
   │   ├─ Hash comparison
   │   ├─ Generate JWT tokens
   │   ├─ Store refresh token in Redis
   │   └─ Return tokens
   │
   ├─► API Gateway aggregates response
   │   └─ Return to client
   │
   ├─ Client stores tokens
   │
   └─► Client GET /users/:userId
       ├─► API Gateway
       │   ├─ Extract authorization header
       │   ├─ Pass JWT to User Service
       │   │
       │   ├─► User Service:
       │   │   ├─ Verify JWT (via Auth Service or JWT library)
       │   │   ├─ Query user_profiles table
       │   │   ├─ Check Redis cache
       │   │   └─ Return profile
       │   │
       │   └─ Aggregate response
       │
       └─ Return profile to client
```

---

## Error Handling Architecture

### Error Response Flow

```
Service receives invalid request
  │
  ├─ Validate input
  │
  ├─ If invalid:
  │   ├─ Return 400 Bad Request
  │   └─ Include error code & message
  │
  ├─ Check authorization
  │   ├─ If unauthorized:
  │   │   ├─ Return 401/403
  │   │   └─ Include error details
  │
  ├─ Call downstream service
  │   ├─ If service unavailable:
  │   │   ├─ Circuit breaker opens
  │   │   ├─ Return 503 Service Unavailable
  │   │   └─ Retry after timeout
  │
  └─ If server error:
      ├─ Log error
      ├─ Return 500
      └─ Include request ID for tracking
```

### Error Codes

```
Authentication:
- INVALID_CREDENTIALS (401)
- INVALID_TOKEN (401)
- EMAIL_ALREADY_EXISTS (409)

Authorization:
- UNAUTHORIZED_UPDATE (403)
- INSUFFICIENT_PERMISSIONS (403)

Resource:
- USER_NOT_FOUND (404)
- NOTIFICATION_NOT_FOUND (404)

Validation:
- INVALID_EMAIL (400)
- INVALID_PASSWORD (400)

Rate Limiting:
- TOO_MANY_ATTEMPTS (429)
- RATE_LIMIT_EXCEEDED (429)

Server:
- SERVICE_UNAVAILABLE (503)
- INTERNAL_ERROR (500)
```

---

## Scalability Considerations

### Horizontal Scaling

```
Production Setup:
┌──────────────────────────────────┐
│     Load Balancer                │
└────┬──────────────────────────┬──┘
     │                          │
┌────▼──────────┐      ┌────────▼────┐
│ API GW (pod1) │      │ API GW (pod2)│
└────┬─────┬────┘      └────┬─────┬───┘
     │     │                │     │
  ┌──▼──┐ ┌──▼──┐      ┌─────▼─┐ ┌───▼──┐
  │Auth1│ │Auth2│  ...  │User1  │ │User2 │ ...
  └─────┘ └─────┘      └───────┘ └──────┘
```

**Scaling Rules:**
- API Gateway: 1-3 replicas
- Auth Service: 1-2 replicas
- User Service: 1-2 replicas
- Notification Service: 1 replica (or N for throughput)

**Database Scaling:**
- Read replicas for User DB
- Connection pooling (PgBouncer)
- Vertical scaling for Auth DB

**Message Queue:**
- RabbitMQ in cluster mode
- Multiple consumer instances

---

## Deployment Topology

### Local Development
```
Docker Compose:
- Single Docker network
- All services connected
- Shared databases
- Health checks enabled
```

### Production (Kubernetes)
```
Namespace: microservices
├── api-gateway deployment (1-3 replicas)
├── auth-service statefulset (1-3 replicas)
├── user-service statefulset (1-3 replicas)
├── notification-service deployment (1-N replicas)
├── postgres-auth statefulset
├── postgres-user statefulset
├── rabbitmq statefulset (cluster)
└── redis deployment (with persistence)
```

---

## Monitoring & Observability

### Logging
```
Each service logs:
- Request entry/exit
- Service calls
- Database queries
- Errors with stack traces
- Performance metrics

Format: JSON for easy parsing
{"timestamp": "...", "level": "INFO", "service": "auth-service", ...}
```

### Tracing
```
X-Trace-Id: Generated at API Gateway
X-Span-Id: Generated per service
X-Parent-Span-Id: Propagated through calls

Example flow:
API Gateway → Auth Service
X-Trace-Id: trace-001
  ├─ X-Span-Id: span-gateway-001
  └─ X-Span-Id: span-auth-001 (parent: span-gateway-001)
```

### Metrics
```
Prometheus targets:
- HTTP request count
- HTTP request duration
- Database query duration
- Message queue depth
- Cache hit/miss ratio
```

---

## Security Architecture

### Authentication & Authorization
```
1. Client sends credentials → Auth Service
2. Auth Service validates → Issues JWT
3. JWT stored in headers (Authorization: Bearer ...)
4. API Gateway verifies JWT signature
5. Each service validates token expiry

Token Structure:
{
  "userId": "...",
  "email": "...",
  "iat": 1234567890,
  "exp": 1234568790,
  "type": "access"
}
```

### Data Protection
```
- Passwords: bcrypt (cost: 12)
- In-transit: HTTPS (TLS 1.3)
- Tokens: JWT with RS256 signature
- Sensitive data: Encrypted at rest
```

### Network Security
```
- Services isolated to private network
- API Gateway only public endpoint
- Rate limiting per IP/user
- Request validation on all endpoints
```

---

## Conclusion

This architecture provides:
- **Scalability**: Services scale independently
- **Resilience**: Failures isolated per service
- **Flexibility**: Different tech stacks per service
- **Maintainability**: Clear service boundaries
- **Observability**: Tracing and logging built-in
