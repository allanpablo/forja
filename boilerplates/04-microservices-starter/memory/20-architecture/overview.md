# 🏛️ Architecture Overview

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                 │
│                   (Web, Mobile, Desktop)                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                ┌──────────────▼──────────────┐
                │      API GATEWAY            │
                │   (Port 3000, NestJS)       │
                │  - Routing                  │
                │  - Auth & CORS              │
                │  - Rate Limiting            │
                │  - Error Handling           │
                └───┬──────────────────┬──────┘
                    │                  │
        ┌───────────┼──────────────────┼───────────┐
        │           │                  │           │
        ▼           ▼                  ▼           ▼
   ┌─────────┐ ┌──────────┐     ┌──────────┐ ┌──────────────┐
   │ AUTH    │ │  USER    │     │NOTIF.    │ │   REDIS      │
   │SERVICE  │ │ SERVICE  │     │ SERVICE  │ │   (Cache)    │
   │:3001    │ │ :3002    │     │  :3003   │ │   (Port 6379)│
   └────┬────┘ └────┬─────┘     └────┬─────┘ └──────────────┘
        │           │                │
        │           │                │
   ┌────▼────┐  ┌───▼────┐    ┌─────▼──┐
   │PostgreSQL│  │PostgreSQL│  │RabbitMQ │
   │  :5432   │  │  :5432   │  │ :5672   │
   │auth_db   │  │users_db  │  │(Events) │
   └──────────┘  └──────────┘  └─────────┘
```

---

## Service Mesh Communication Flows

### Synchronous (REST/HTTP)
```
Client
  │
  ├─ POST /auth/login
  │   └─► API Gateway
  │       └─► Auth Service (3001)
  │           ├─ Validate credentials
  │           ├─ Check password (bcrypt)
  │           └─ Return JWT token
  │
  └─ GET /users/:id
      └─► API Gateway
          └─ Check Authorization header
             └─► User Service (3002)
                 ├─ Query database
                 └─ Return user data
```

### Asynchronous (Message Queue)
```
Auth Service
  │
  └─ publish: "user.created"
      │
      ├─► RabbitMQ
      │   ├─ Persist event
      │   └─ Fan-out to consumers
      │
      ├─► User Service consumes
      │   └─ Create user profile
      │
      └─► Notification Service consumes
          └─ Send welcome email
```

---

## Deployment Topology

### Local Development (Docker Compose)
```yaml
Services:
  - api-gateway:3000       (NestJS)
  - auth-service:3001      (NestJS + PostgreSQL:5432)
  - user-service:3002      (NestJS + PostgreSQL:5432)
  - notification-svc:3003  (NestJS)
  - rabbitmq:5672          (Message Queue)
  - redis:6379             (Cache)
```

### Production (Kubernetes Ready)
```
┌─────────────────────────────────────────────┐
│           Kubernetes Cluster                │
├─────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Auth Pod │  │ User Pod │  │ Notif Po │   │
│  │ x2       │  │ x2       │  │ x1       │   │
│  └──────────┘  └──────────┘  └──────────┘   │
│       │              │              │        │
│  ┌────▼──┐       ┌───▼────┐    ┌───▼────┐   │
│  │PG Pod │       │PG Pod  │    │(None)  │   │
│  └───────┘       └────────┘    └────────┘   │
│                                              │
│  ┌──────────────┐  ┌──────────┐             │
│  │ RabbitMQ Pod │  │ Redis Pod│             │
│  │              │  │          │             │
│  └──────────────┘  └──────────┘             │
│                                              │
│  ┌──────────────────────────────┐           │
│  │ API Gateway (Ingress)        │           │
│  │ - Load Balancer              │           │
│  │ - SSL Termination            │           │
│  └──────────────────────────────┘           │
└─────────────────────────────────────────────┘
```

---

## Data Architecture

### Per-Service Database
```
auth-service:
  └─ auth_db (PostgreSQL)
     └─ users (email, password_hash, created_at)
     └─ refresh_tokens (token, expires_at)
     └─ sessions (user_id, device_info, created_at)

user-service:
  └─ users_db (PostgreSQL)
     └─ user_profiles (user_id, name, avatar_url, bio)
     └─ user_settings (user_id, theme, notifications_enabled)
     └─ email_verifications (user_id, code, verified_at)

notification-service:
  └─ No persistent database
     └─ Stateless (events from RabbitMQ)
     └─ Uses Redis for: pending email queue, retry counts
```

### Caching Strategy
```
Redis (Port 6379):
  - Session tokens (TTL: 24h)
  - User profiles (TTL: 1h)
  - Auth tokens blacklist (TTL: expiration time)
  - Rate limiting counters (TTL: 1m)
  - Message deduplication IDs (TTL: 1h)
```

### Event Bus (RabbitMQ)
```
Exchanges:
  - user.events    (Fanout) - User lifecycle events
  - auth.events    (Fanout) - Auth events
  - system.events  (Topic)  - System-wide events

Queues:
  - user-service.user-events
  - notification-service.user-events
  - notification-service.auth-events
```

---

## Security Architecture

### Authentication Flow
```
Client
  │
  ├─ POST /auth/login (username, password)
  │
  ├─ Auth Service validates
  │   ├─ Username exists in database
  │   ├─ Hash password with bcrypt
  │   └─ Compare hashes
  │
  ├─ Generate JWT tokens
  │   ├─ Access token (15min expiry)
  │   └─ Refresh token (7 days expiry)
  │
  ├─ Store refresh token in Redis
  │
  └─ Return tokens to client
```

### Authorization
```
Every Request:
  │
  ├─ Extract Authorization header
  │
  ├─ Verify JWT signature (RS256)
  │
  ├─ Check token expiry
  │
  ├─ Validate user permissions
  │   ├─ From token claims
  │   └─ From database (roles/permissions)
  │
  └─ Pass to downstream service
```

---

## Observability Architecture

### Distributed Tracing
```
Request Entry (API Gateway)
  │
  ├─ Generate X-Trace-Id
  ├─ Generate X-Span-Id
  │
  ├─ Auth Service receives
  │   ├─ Create span
  │   ├─ Log operations
  │   └─ Send to Jaeger
  │
  └─ User Service receives
      ├─ Create span (child of Auth span)
      ├─ Database queries
      └─ Send to Jaeger
```

### Metrics
```
Prometheus targets:
  - /metrics (port 9090)
    - HTTP request latency
    - Request count by endpoint
    - Database query duration
    - Message queue depth
    - Cache hit/miss ratio
```

### Logging
```
Centralized (ELK Stack):
  - Filebeat collects logs from each service
  - Logstash parses and enriches
  - Elasticsearch indexes
  - Kibana visualizes
```
