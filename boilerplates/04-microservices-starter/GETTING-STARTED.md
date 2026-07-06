# 🚀 Getting Started with Microservices Starter

## Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- npm or yarn

## 30-Second Quick Start

```bash
# Clone/download and enter the directory
cd boilerplates/04-microservices-starter

# Start all services
docker-compose up

# In another terminal, test the API
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123!"}'
```

Done! 🎉

---

## 📖 What's Running?

| Service | Port | Purpose |
|---------|------|---------|
| API Gateway | 3000 | Entry point for all requests |
| Auth Service | 3001 | Login, register, token management |
| User Service | 3002 | User profiles and settings |
| Notification Service | 3003 | Email and push notifications |
| PostgreSQL (Auth) | 5432 | Auth service database |
| PostgreSQL (User) | 5433 | User service database |
| RabbitMQ | 5672 | Message queue |
| RabbitMQ Admin | 15672 | Message queue dashboard |
| Redis | 6379 | Cache |

---

## 🔐 Test Login

Use these credentials to log in:

```
Email:    test@example.com
Password: TestPassword123!
```

### Get JWT Token

```bash
TOKENS=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123!"}' | jq '.data.tokens')

ACCESS_TOKEN=$(echo $TOKENS | jq -r '.accessToken')
echo $ACCESS_TOKEN
```

---

## 👤 Create a User Profile

```bash
curl -X POST http://localhost:3000/users \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "fullName": "Test User",
    "avatar": "https://via.placeholder.com/150"
  }'
```

---

## 📧 Send a Notification

```bash
curl -X POST http://localhost:3000/notifications/email \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "recipient": "test@example.com",
    "subject": "Welcome!",
    "body": "Thanks for testing our platform",
    "template": "welcome_email"
  }'
```

---

## 📚 Documentation

### Start Here
1. **[README.md](./README.md)** - Project overview
2. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System design
3. **[API-EXAMPLES.md](./API-EXAMPLES.md)** - API usage examples

### Memory System (Knowledge Base)
The `memory/` folder contains comprehensive documentation:

- **[mission.md](./memory/00-global/mission.md)** - Vision and goals
- **[patterns.md](./memory/00-global/patterns.md)** - Architectural patterns
- **[overview.md](./memory/20-architecture/overview.md)** - Architecture details
- **[topology.md](./memory/50-orchestration/topology.md)** - Service topology
- **API specs** - See `memory/30-domains/*/api.md`

---

## 🛠️ Common Tasks

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f auth-service

# Last 50 lines
docker-compose logs --tail=50 user-service
```

### Stop Services
```bash
docker-compose down
```

### Reset Everything
```bash
docker-compose down -v  # Remove volumes too
docker-compose up --build
```

### Access RabbitMQ Admin
- URL: http://localhost:15672
- Username: guest
- Password: guest

### Access PostgreSQL
```bash
# Auth database
docker-compose exec postgres-auth psql -U postgres -d auth_db

# User database
docker-compose exec postgres-user psql -U postgres -d users_db
```

### Check Redis
```bash
docker-compose exec redis redis-cli

# Check keys
redis-cli KEYS "*"
```

---

## 📋 Next Steps

### 1. Explore APIs
- See [API-EXAMPLES.md](./API-EXAMPLES.md) for all endpoints
- Try different operations (create, read, update, delete)
- Check error handling

### 2. Understand Architecture
- Read [ARCHITECTURE.md](./ARCHITECTURE.md)
- Understand service boundaries
- Review communication patterns

### 3. Customize for Your Domain
- Update service names in memory/30-domains/
- Add new domains as needed
- Extend data models
- Add new endpoints

### 4. Add Database Schemas
- Services currently use in-memory storage
- Add PostgreSQL migrations
- See `memory/80-data/` for schema documentation

### 5. Implement Message Consumers
- Services publish events to RabbitMQ
- Implement consumers for cross-service workflows
- See examples in `memory/50-orchestration/`

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Change ports in docker-compose.yml
```

### Services won't connect
```bash
# Check network
docker network ls

# Check DNS resolution
docker-compose exec api-gateway nslookup auth-service

# Check logs
docker-compose logs auth-service
```

### Database errors
```bash
# Verify database is running
docker-compose ps postgres-auth

# Check database logs
docker-compose logs postgres-auth

# Reset database
docker-compose down -v
docker-compose up
```

---

## 📞 Support

For detailed information:
- Architecture: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- APIs: See [API-EXAMPLES.md](./API-EXAMPLES.md)
- Design: See [memory/20-architecture/overview.md](./memory/20-architecture/overview.md)
- Services: See [memory/30-domains/](./memory/30-domains/)

---

## 📄 License

MIT

---

Enjoy building! 🎉
