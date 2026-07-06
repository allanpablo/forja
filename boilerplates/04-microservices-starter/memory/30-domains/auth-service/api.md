# 🔐 Auth Service - API Specification

## Base URL
```
Local:      http://localhost:3001
Docker:     http://auth-service:3001
Production: https://api.example.com/auth
```

---

## Endpoints

### 1. Register
```http
POST /auth/register
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}

Response 201 Created:
{
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc...",
      "expiresIn": 900
    }
  },
  "meta": {
    "requestId": "req-123",
    "timestamp": "2024-01-15T10:30:00Z",
    "processingTime": 145
  }
}

Error 400 Bad Request:
{
  "error": {
    "code": "INVALID_EMAIL",
    "message": "Email format is invalid",
    "statusCode": 400
  }
}

Error 409 Conflict:
{
  "error": {
    "code": "EMAIL_ALREADY_EXISTS",
    "message": "Email is already registered",
    "statusCode": 409
  }
}
```

---

### 2. Login
```http
POST /auth/login
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

Response 200 OK:
{
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc...",
      "expiresIn": 900
    }
  },
  "meta": {
    "requestId": "req-124",
    "timestamp": "2024-01-15T10:31:00Z",
    "processingTime": 89
  }
}

Error 401 Unauthorized:
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect",
    "statusCode": 401
  }
}

Error 429 Too Many Requests:
{
  "error": {
    "code": "TOO_MANY_ATTEMPTS",
    "message": "Too many login attempts. Try again in 15 minutes.",
    "statusCode": 429,
    "details": {
      "retryAfter": 900
    }
  }
}
```

---

### 3. Refresh Token
```http
POST /auth/refresh
Content-Type: application/json
Authorization: Bearer <refreshToken>

Request:
{}

Response 200 OK:
{
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresIn": 900
  },
  "meta": {
    "requestId": "req-125",
    "timestamp": "2024-01-15T10:32:00Z",
    "processingTime": 45
  }
}

Error 401 Unauthorized:
{
  "error": {
    "code": "INVALID_REFRESH_TOKEN",
    "message": "Refresh token is invalid or expired",
    "statusCode": 401
  }
}
```

---

### 4. Verify Token
```http
GET /auth/verify
Authorization: Bearer <accessToken>

Response 200 OK:
{
  "data": {
    "valid": true,
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "expiresAt": "2024-01-15T10:45:00Z"
  },
  "meta": {
    "requestId": "req-126",
    "timestamp": "2024-01-15T10:33:00Z",
    "processingTime": 12
  }
}

Error 401 Unauthorized:
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Token is invalid or expired",
    "statusCode": 401
  }
}
```

---

### 5. Logout
```http
POST /auth/logout
Authorization: Bearer <accessToken>

Request:
{
  "refreshToken": "eyJhbGc..."
}

Response 200 OK:
{
  "data": {
    "message": "Successfully logged out"
  },
  "meta": {
    "requestId": "req-127",
    "timestamp": "2024-01-15T10:34:00Z",
    "processingTime": 35
  }
}
```

---

### 6. Health Check
```http
GET /health

Response 200 OK:
{
  "status": "UP",
  "timestamp": "2024-01-15T10:35:00Z",
  "checks": {
    "database": { "status": "UP" },
    "redis": { "status": "UP" }
  }
}

Response 503 Service Unavailable:
{
  "status": "DOWN",
  "checks": {
    "database": { "status": "DOWN", "error": "Connection refused" },
    "redis": { "status": "UP" }
  }
}
```

---

## Request/Response Schemas

### Error Schema
```typescript
interface ErrorResponse {
  error: {
    code: string;           // Machine-readable error code
    message: string;        // Human-readable message
    statusCode: number;     // HTTP status code
    details?: Record<string, any>;
    timestamp: string;      // ISO8601
    requestId: string;      // For tracing
  };
}
```

### Success Schema
```typescript
interface SuccessResponse<T> {
  data: T;
  meta: {
    requestId: string;
    timestamp: string;      // ISO8601
    processingTime: number; // ms
  };
}
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Invalid request |
| 401 | Unauthorized |
| 409 | Conflict (resource exists) |
| 429 | Rate limited |
| 500 | Server error |
| 503 | Service unavailable |

---

## Rate Limiting

```
/auth/login:    5 attempts per 15 minutes (per IP)
/auth/register: 3 registrations per hour (per IP)
Others:         100 requests per minute (per user)
```

Header responses:
```
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 97
X-RateLimit-Reset:     1705318200
```
