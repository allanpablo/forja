# 🔗 Service Topology & Discovery

## Physical Topology

### Local Development (Docker Compose)
```
┌────────────────────────────────────────────────────────────────┐
│                    HOST MACHINE (localhost)                     │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │               Docker Network: app-network               │  │
│  │                                                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐   │  │
│  │  │ API Gateway  │  │ Auth Service │  │User Service│   │  │
│  │  │ :3000        │  │ :3001        │  │:3002       │   │  │
│  │  └──────────────┘  └──────────────┘  └────────────┘   │  │
│  │                                                         │  │
│  │  ┌──────────────────┐  ┌─────────────┐  ┌──────────┐  │  │
│  │  │ Notification Svc │  │  RabbitMQ   │  │  Redis   │  │  │
│  │  │ :3003            │  │  :5672      │  │  :6379   │  │  │
│  │  └──────────────────┘  └─────────────┘  └──────────┘  │  │
│  │                                                         │  │
│  │  ┌──────────────────┐  ┌──────────────┐               │  │
│  │  │  PostgreSQL      │  │  PostgreSQL  │               │  │
│  │  │  (auth_db)       │  │  (users_db)  │               │  │
│  │  │  :5432           │  │  :5432       │               │  │
│  │  └──────────────────┘  └──────────────┘               │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Service Registry (DNS-based, Docker Compose)
```
Service Name          Hostname              Port   Internal DNS
─────────────────────────────────────────────────────────────────
API Gateway          api-gateway           3000   api-gateway:3000
Auth Service         auth-service          3001   auth-service:3001
User Service         user-service          3002   user-service:3002
Notification Svc     notification-service  3003   notification-service:3003
RabbitMQ            rabbitmq              5672   rabbitmq:5672
Redis               redis                 6379   redis:6379
PostgreSQL (Auth)   postgres-auth         5432   postgres-auth:5432
PostgreSQL (User)   postgres-user         5432   postgres-user:5432
```

### Service Discovery Rules
```
Auth Service
  ├─ Finds user-service via: http://user-service:3002
  └─ Finds RabbitMQ via: amqp://rabbitmq:5672

User Service
  ├─ Finds auth-service via: http://auth-service:3001
  └─ Finds RabbitMQ via: amqp://rabbitmq:5672

Notification Service
  ├─ Finds RabbitMQ via: amqp://rabbitmq:5672
  └─ Finds Redis via: redis://redis:6379

API Gateway
  ├─ Routes to auth-service via: http://auth-service:3001
  ├─ Routes to user-service via: http://user-service:3002
  └─ Routes to notification-service via: http://notification-service:3003
```

---

## Port Mapping

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| api-gateway | 3000 | HTTP | Client entry point |
| auth-service | 3001 | HTTP | Authentication API |
| user-service | 3002 | HTTP | User Management API |
| notification-service | 3003 | HTTP | Notifications API |
| postgres-auth | 5432 | PostgreSQL | Auth database |
| postgres-user | 5432 | PostgreSQL | User database |
| rabbitmq | 5672 | AMQP | Message broker |
| rabbitmq | 15672 | HTTP | Admin UI |
| redis | 6379 | Redis | Cache |

---

## Database Connections

### Auth Service Database
```
Host: postgres-auth
Port: 5432
Database: auth_db
Username: postgres (dev only)
Password: password (dev only)

Connection String:
postgresql://postgres:password@postgres-auth:5432/auth_db
```

### User Service Database
```
Host: postgres-user
Port: 5432
Database: users_db
Username: postgres (dev only)
Password: password (dev only)

Connection String:
postgresql://postgres:password@postgres-user:5432/users_db
```

---

## Message Queue Topology

### RabbitMQ Exchanges & Queues
```
┌─ Exchange: user.events (Fanout)
│  ├─ Queue: auth-service.user-events
│  ├─ Queue: notification-service.user-events
│  └─ Queue: user-service.user-events (self-confirmation)
│
├─ Exchange: auth.events (Fanout)
│  ├─ Queue: user-service.auth-events
│  └─ Queue: notification-service.auth-events
│
└─ Exchange: system.events (Topic)
   └─ Queue: monitoring.system-events
```

### Event Flow
```
auth-service publishes        user-service publishes      notification-service publishes
  → user.registered           → user.profile_updated        → notification.sent
  → user.authenticated        → user.email_verified         → notification.failed
  → password.reset_requested  → user.deleted
       ↓                            ↓                             ↓
   Exchange: user.events       Exchange: user.events       (responds to events)
       ↓                            ↓
   Fanout to subscribers:      Fanout to subscribers:
   - user-service              - notification-service
   - notification-service      - auth-service (listening)
```

---

## Service-to-Service Communication

### REST Calls (Synchronous)
```
Client
  │
  ├─ POST /auth/login
  │   ├─ IP: 127.0.0.1 → API Gateway (3000)
  │   └─ API Gateway → Auth Service (http://auth-service:3001/auth/login)
  │
  ├─ GET /users/123
  │   ├─ IP: 127.0.0.1 → API Gateway (3000)
  │   └─ API Gateway → User Service (http://user-service:3002/users/123)
  │
  └─ GET /notifications
      ├─ IP: 127.0.0.1 → API Gateway (3000)
      └─ API Gateway → Notification Service (http://notification-service:3003/notifications)
```

### Health Check Discovery
```
Every 10 seconds:
  - API Gateway checks http://auth-service:3001/health
  - API Gateway checks http://user-service:3002/health
  - API Gateway checks http://notification-service:3003/health
  
If service is DOWN:
  - Mark unhealthy
  - Remove from load balancer
  - Retry connection every 30 seconds
  - Alert monitoring system
```

---

## Production Deployment Considerations

### DNS Resolution (Kubernetes)
```
api-gateway.default.svc.cluster.local:3000
auth-service.default.svc.cluster.local:3001
user-service.default.svc.cluster.local:3002
notification-service.default.svc.cluster.local:3003
```

### Service Discovery (Consul Ready)
```
Services register to Consul with:
  - Service name
  - Port
  - Health check endpoint
  - Tags (e.g., 'http', 'v1')

Clients query Consul for available instances
and use client-side load balancing
```

### Load Balancing
```
External LB → api-gateway pods (x1-3 replicas)
               ├─ api-gateway-1
               ├─ api-gateway-2
               └─ api-gateway-3

Upstream (internal):
api-gateway → auth-service pods (x1-2 replicas)
            → user-service pods (x1-2 replicas)
            → notification-service pod (x1 replica)
```
