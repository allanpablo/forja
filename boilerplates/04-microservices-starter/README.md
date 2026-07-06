# 🚀 Microservices Starter Kit

A modern, production-ready microservices boilerplate built with **NestJS**, **TypeScript**, **Docker**, and **RabbitMQ**.

## 📋 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- npm

### Run with Docker Compose
```bash
docker-compose up
```

Services will be available at:
- **API Gateway**: http://localhost:3000
- **Auth Service**: http://localhost:3001
- **User Service**: http://localhost:3002
- **Notification Service**: http://localhost:3003
- **RabbitMQ Admin**: http://localhost:15672 (guest/guest)
- **PostgreSQL Auth**: localhost:5432
- **PostgreSQL User**: localhost:5433
- **Redis**: localhost:6379

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT APPLICATION                      │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────▼──────────────┐
          │     API GATEWAY (3000)      │
          │  - Routing                  │
          │  - Auth/Rate Limiting       │
          │  - Error Handling           │
          └────┬──────────────────┬─────┘
               │                  │
      ┌────────▼────┐   ┌────────▼──────┐
      │ AUTH (3001) │   │ USER (3002)   │
      │ PostgreSQL  │   │ PostgreSQL    │
      └─────────────┘   └───────────────┘
               │                  │
               └────────┬─────────┘
                        │
          ┌─────────────▼──────────┐
          │  NOTIFICATION (3003)   │
          │  RabbitMQ (Events)     │
          │  Redis (Cache)         │
          └────────────────────────┘
```

---

## 🏗️ Project Structure

```
04-microservices-starter/
├── memory/                          # Knowledge base (10 levels)
│   ├── 00-global/                   # Mission, patterns, policies
│   ├── 10-product/                  # Vision, personas, business rules
│   ├── 20-architecture/             # System design
│   ├── 30-domains/                  # Service-specific contexts
│   │   ├── auth-service/
│   │   ├── user-service/
│   │   └── notification-service/
│   ├── 40-delivery/                 # Roadmap, sprints
│   ├── 50-orchestration/            # Topology, routing
│   ├── 60-runs/                     # Execution logs
│   ├── 70-summaries/                # Quick references
│   ├── 80-data/                     # DB schemas
│   └── 90-decisions/                # ADRs
├── backend/
│   ├── api-gateway/                 # Entry point (port 3000)
│   ├── services/
│   │   ├── auth-service/            # OAuth2, JWT (port 3001)
│   │   ├── user-service/            # User profiles (port 3002)
│   │   └── notification-service/    # Emails, push (port 3003)
│   └── shared/                      # Shared types, constants, utils
├── docker-compose.yml               # All services orchestration
├── package.json                     # Monorepo workspaces
└── README.md                        # This file
```

---

## 🔐 Authentication Flow

```
1. POST /auth/register
   ├─ Validate email & password
   ├─ Hash password (bcrypt)
   └─ Return JWT tokens

2. POST /auth/login
   ├─ Find user
   ├─ Compare passwords
   └─ Return JWT tokens

3. POST /auth/refresh
   ├─ Validate refresh token
   └─ Issue new access token

4. GET /auth/verify
   ├─ Check JWT signature
   └─ Return user info
```

### Test Credentials (Dev)
```
Email:    test@example.com
Password: TestPassword123!
```

---

## 👤 User Service

### Create User Profile
```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "fullName": "John Doe",
    "avatar": "https://..."
  }'
```

### Get User Profile
```bash
curl -X GET http://localhost:3000/users/:userId \
  -H "Authorization: Bearer <token>"
```

### Update Profile
```bash
curl -X PATCH http://localhost:3000/users/:userId \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Jane Doe",
    "bio": "Updated bio"
  }'
```

---

## 📧 Notifications Service

### Send Email
```bash
curl -X POST http://localhost:3000/notifications/email \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "recipient": "user@example.com",
    "subject": "Welcome!",
    "body": "Thanks for signing up",
    "template": "welcome_email"
  }'
```

### Get Templates
```bash
curl -X GET http://localhost:3000/notifications/templates
```

---

## 🔄 Event-Driven Communication

Services communicate asynchronously via **RabbitMQ**:

### Events Published

**Auth Service:**
- `user.registered` - New user created
- `password.reset_requested` - Password reset initiated
- `user.authenticated` - User logged in

**User Service:**
- `user.profile_updated` - Profile changed
- `user.email_verified` - Email verified
- `user.deleted` - User account deleted

**Notification Service:**
- `notification.sent` - Email/push sent
- `notification.failed` - Delivery failed

### Subscribe to Events
Services auto-subscribe to relevant events on startup.

---

## 🏥 Health Checks

```bash
# API Gateway
curl http://localhost:3000/gateway/health

# Auth Service
curl http://localhost:3001/health

# User Service
curl http://localhost:3002/health

# Notification Service
curl http://localhost:3003/health
```

---

## 📈 Performance & Resilience

### Rate Limiting
```
/auth/login:    5 attempts per 15 minutes
/auth/register: 3 registrations per hour
Others:         100 requests per minute
```

### Circuit Breaker
- **Failure threshold**: 50%
- **Success threshold**: 80%
- **Timeout**: 30 seconds

### Retry Policy
```
Max retries:     3
Backoff:         Exponential (100ms, 200ms, 400ms)
Retry on:        408, 429, 5xx errors
```

### Timeouts
```
Default:         5 seconds
Critical:        10 seconds
Batch ops:       30 seconds
```

---

## 🛠️ Development

### Local Setup (without Docker)

```bash
# Install dependencies
npm install

# Build all services
npm run build

# Start auth-service
cd backend/services/auth-service
npm start

# In another terminal, start user-service
cd backend/services/user-service
npm start

# In another terminal, start API Gateway
cd backend/api-gateway
npm start
```

### Run Tests
```bash
npm test --workspaces
```

### Run Linter
```bash
npm run lint --workspaces
```

---

## 📚 Documentation

### Memory Structure
The `memory/` folder contains comprehensive documentation:
- **00-global/**: Mission, patterns, context policies
- **10-product/**: Vision, personas, business rules
- **20-architecture/**: System design
- **30-domains/**: Per-service specifications
- **50-orchestration/**: Service topology and routing
- **90-decisions/**: Architecture decisions (ADRs)

Start with `memory/00-global/mission.md` and `memory/20-architecture/overview.md`.

---

## 🚢 Deployment

### Docker Compose (Development)
```bash
docker-compose up
docker-compose down
docker-compose logs -f
```

### Production Deployment (Kubernetes Ready)
Services include:
- Health checks for readiness probes
- Structured logging for container orchestration
- Service discovery via DNS
- Resource limits recommendations
- No hardcoded configuration

See `memory/50-orchestration/topology.md` for Kubernetes deployment patterns.

---

## 🔧 Configuration

### Environment Variables

**API Gateway:**
```env
NODE_ENV=development
PORT=3000
```

**Auth Service:**
```env
NODE_ENV=development
PORT=3001
JWT_SECRET=super-secret-key-change-in-production
```

**User Service:**
```env
NODE_ENV=development
PORT=3002
POSTGRES_USER_HOST=postgres-user
POSTGRES_USER_PORT=5432
POSTGRES_USER_DB=users_db
```

**RabbitMQ:**
```env
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest
```

---

## 📊 API Response Format

### Success Response (200)
```json
{
  "data": {
    "userId": "user-123",
    "email": "user@example.com"
  },
  "meta": {
    "requestId": "req-123",
    "timestamp": "2024-01-15T10:30:00Z",
    "processingTime": 45
  }
}
```

### Error Response (4xx/5xx)
```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User with ID user-123 not found",
    "statusCode": 404,
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req-123"
  }
}
```

---

## 🐛 Troubleshooting

### Services won't start
```bash
# Check logs
docker-compose logs -f

# Ensure ports are available
lsof -i :3000 :3001 :3002 :3003

# Rebuild containers
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

### Database connection errors
```bash
# Check PostgreSQL is running
docker-compose ps postgres-auth

# Verify connectivity
docker-compose exec postgres-auth psql -U postgres -d auth_db
```

### RabbitMQ issues
```bash
# Access RabbitMQ Admin
http://localhost:15672 (guest/guest)

# Check queue status
docker-compose exec rabbitmq rabbitmq-diagnostics -q queues
```

---

## 📝 Contributing

1. Services follow **Domain-Driven Design** principles
2. Each service owns its database (database per service pattern)
3. Communication is **REST for sync**, **RabbitMQ for async**
4. Always use the shared types from `backend/shared/`
5. Add memory documentation for significant changes

---

## 📄 License

MIT

---

## 🔗 Related Resources

- [Memory/Architecture Overview](./memory/20-architecture/overview.md)
- [Service Topology](./memory/50-orchestration/topology.md)
- [API Specifications](./memory/30-domains/README.md)
- [Agent Contract](./memory/00-global/agent-contract.md)
- [Decision Records](./memory/90-decisions/)

---

## 🎯 Next Steps

1. ✅ Run `docker-compose up`
2. ✅ Test endpoints: `POST /auth/login` with test credentials
3. ✅ Create user: `POST /users`
4. ✅ Send notification: `POST /notifications/email`
5. ✅ Explore memory documentation in `memory/`
6. ✅ Customize for your business domain

---

## 💬 Support

For issues or questions, refer to:
- `memory/00-global/` - Architectural decisions
- `memory/30-domains/*/api.md` - API specifications
- `memory/50-orchestration/` - System topology
