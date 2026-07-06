# 📋 Context Policy

## Request Context Propagation
Todo request deve carregar contexto através da plataforma via headers HTTP.

### Headers Padronizados

```
X-Request-Id:      UUID único (obrigatório)
X-Correlation-Id:  ID para rastreamento distribuído
X-User-Id:         ID do usuário autenticado
X-Tenant-Id:       ID do tenant (multi-tenancy ready)
X-Trace-Parent:    W3C Trace Context para OpenTelemetry
Authorization:     Bearer <JWT Token>
```

### Exemplo de Request
```http
GET /api/users/123/profile HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGc...
X-Request-Id: f58a57f6-5a0f-4f8e-8c5e-1e8a0c9a9c9c
X-Correlation-Id: trace-2024-01-15-001
X-User-Id: user-789
X-Trace-Parent: 00-trace-span-00
```

---

## Error Response Format
Todos os erros devem seguir o formato JSON padronizado.

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User with ID 123 not found",
    "statusCode": 404,
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "f58a57f6-5a0f-4f8e-8c5e-1e8a0c9a9c9c",
    "details": {
      "userId": "123",
      "service": "user-service"
    }
  }
}
```

---

## Service-to-Service Communication Rules

### 1. Timeouts
- Default: 5s
- Critical operations: 10s
- Batch operations: 30s

### 2. Retry Logic
- Max retries: 3
- Backoff strategy: exponential (100ms, 200ms, 400ms)
- Retry only on: 408, 429, 500, 502, 503, 504

### 3. Circuit Breaker Thresholds
- Failure threshold: 50% (5 failures in 10 requests)
- Success threshold: 80% (8 successes in 10 requests)
- Timeout duration: 30s

---

## Health Check Protocol

Cada serviço deve expor `/health` endpoint com status:

```json
{
  "status": "UP",
  "timestamp": "2024-01-15T10:30:00Z",
  "checks": {
    "database": { "status": "UP" },
    "redis": { "status": "UP" },
    "rabbitmq": { "status": "UP" }
  }
}
```

Status codes:
- `UP` (200): Serviço totalmente operacional
- `DEGRADED` (200): Serviço operacional com problemas parciais
- `DOWN` (503): Serviço indisponível
