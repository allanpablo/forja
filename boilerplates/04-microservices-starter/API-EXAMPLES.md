# 📚 API Examples - Microservices Starter

Este arquivo contém exemplos práticos de como usar cada endpoint da plataforma.

## 🔐 Authentication Service

### 1. Register (Criar nova conta)

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "SecurePass123!",
    "name": "New User"
  }'
```

**Response (201):**
```json
{
  "data": {
    "userId": "user-id-from-token",
    "email": "newuser@example.com",
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
```

---

### 2. Login (Fazer login)

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

**Response (200):**
```json
{
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 900
    }
  },
  "meta": {
    "requestId": "req-124",
    "timestamp": "2024-01-15T10:31:00Z",
    "processingTime": 89
  }
}
```

**Test Credentials:**
- Email: `test@example.com`
- Password: `TestPassword123!`

---

### 3. Refresh Token (Renovar token de acesso)

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Authorization: Bearer <refreshToken>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response (200):**
```json
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
```

---

### 4. Verify Token (Validar token)

```bash
curl -X GET http://localhost:3000/auth/verify \
  -H "Authorization: Bearer <accessToken>"
```

**Response (200):**
```json
{
  "data": {
    "valid": true,
    "message": "Token is valid"
  },
  "meta": {
    "requestId": "req-126",
    "timestamp": "2024-01-15T10:33:00Z",
    "processingTime": 12
  }
}
```

---

### 5. Logout (Fazer logout)

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<refreshToken>"
  }'
```

**Response (200):**
```json
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

## 👤 User Service

### 1. Create User Profile (Criar perfil de usuário)

```bash
curl -X POST http://localhost:3000/users \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "fullName": "John Doe",
    "avatar": "https://cdn.example.com/avatars/john.jpg"
  }'
```

**Response (201):**
```json
{
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "fullName": "John Doe",
    "emailVerified": false,
    "createdAt": "2024-01-15T10:36:00Z"
  },
  "meta": {
    "requestId": "req-202",
    "timestamp": "2024-01-15T10:36:00Z",
    "processingTime": 156
  }
}
```

---

### 2. Get User Profile (Obter perfil de usuário)

```bash
curl -X GET http://localhost:3000/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer <accessToken>"
```

**Response (200):**
```json
{
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "fullName": "John Doe",
    "avatar": "https://cdn.example.com/avatars/john.jpg",
    "bio": "Software engineer and coffee enthusiast",
    "emailVerified": true,
    "emailVerifiedAt": "2024-01-10T12:00:00Z",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z",
    "settings": {
      "theme": "dark",
      "notificationsEnabled": true,
      "language": "en",
      "timeZone": "America/Sao_Paulo"
    }
  },
  "meta": {
    "requestId": "req-201",
    "timestamp": "2024-01-15T10:35:00Z",
    "processingTime": 45
  }
}
```

---

### 3. Update User Profile (Atualizar perfil)

```bash
curl -X PATCH http://localhost:3000/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Smith",
    "bio": "Updated bio",
    "avatar": "https://cdn.example.com/avatars/new-john.jpg"
  }'
```

**Response (200):**
```json
{
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "fullName": "John Smith",
    "bio": "Updated bio",
    "avatar": "https://cdn.example.com/avatars/new-john.jpg",
    "updatedAt": "2024-01-15T10:37:00Z"
  },
  "meta": {
    "requestId": "req-203",
    "timestamp": "2024-01-15T10:37:00Z",
    "processingTime": 89
  }
}
```

---

### 4. Update User Settings (Atualizar configurações)

```bash
curl -X PATCH http://localhost:3000/users/550e8400-e29b-41d4-a716-446655440000/settings \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "theme": "light",
    "notificationsEnabled": false,
    "language": "pt",
    "timeZone": "America/Sao_Paulo"
  }'
```

**Response (200):**
```json
{
  "data": {
    "settings": {
      "theme": "light",
      "notificationsEnabled": false,
      "language": "pt",
      "timeZone": "America/Sao_Paulo"
    }
  },
  "meta": {
    "requestId": "req-204",
    "timestamp": "2024-01-15T10:38:00Z",
    "processingTime": 67
  }
}
```

---

### 5. Request Email Verification (Solicitar verificação de email)

```bash
curl -X POST http://localhost:3000/users/550e8400-e29b-41d4-a716-446655440000/verify-email \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response (200):**
```json
{
  "data": {
    "message": "Verification code sent to user@example.com"
  },
  "meta": {
    "requestId": "req-205",
    "timestamp": "2024-01-15T10:39:00Z",
    "processingTime": 234
  }
}
```

---

### 6. Confirm Email Verification (Confirmar verificação)

```bash
curl -X POST http://localhost:3000/users/550e8400-e29b-41d4-a716-446655440000/confirm-email \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456"
  }'
```

**Response (200):**
```json
{
  "data": {
    "emailVerified": true,
    "emailVerifiedAt": "2024-01-15T10:40:00Z"
  },
  "meta": {
    "requestId": "req-206",
    "timestamp": "2024-01-15T10:40:00Z",
    "processingTime": 78
  }
}
```

---

### 7. Delete User Account (Deletar conta)

```bash
curl -X DELETE http://localhost:3000/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer <accessToken>"
```

**Response (204 No Content)**

---

### 8. List Users (Listar usuários)

```bash
curl -X GET "http://localhost:3000/users?limit=10&offset=0" \
  -H "Authorization: Bearer <accessToken>"
```

**Response (200):**
```json
{
  "data": {
    "data": [
      {
        "userId": "550e8400-e29b-41d4-a716-446655440000",
        "email": "john@example.com",
        "fullName": "John Doe",
        "avatar": "https://cdn.example.com/avatars/550e8400.jpg"
      }
    ],
    "pagination": {
      "limit": 10,
      "offset": 0,
      "total": 42
    }
  },
  "meta": {
    "requestId": "req-207",
    "timestamp": "2024-01-15T10:41:00Z",
    "processingTime": 145
  }
}
```

---

## 📧 Notification Service

### 1. Send Email (Enviar email)

```bash
curl -X POST http://localhost:3000/notifications/email \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "recipient": "user@example.com",
    "subject": "Welcome to our platform!",
    "body": "Thanks for signing up...",
    "template": "welcome_email",
    "templateVars": {
      "name": "John",
      "activationLink": "https://example.com/activate/123"
    }
  }'
```

**Response (202 Accepted):**
```json
{
  "data": {
    "notificationId": "notif-550e8400",
    "status": "pending",
    "createdAt": "2024-01-15T10:45:00Z"
  },
  "meta": {
    "requestId": "req-301",
    "timestamp": "2024-01-15T10:45:00Z",
    "processingTime": 45
  }
}
```

---

### 2. Send Push Notification (Enviar notificação push)

```bash
curl -X POST http://localhost:3000/notifications/push \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "New message",
    "body": "You have a new message from John",
    "data": {
      "action": "open_messages",
      "sender_id": "user-123"
    }
  }'
```

**Response (202 Accepted):**
```json
{
  "data": {
    "notificationId": "notif-550e8401",
    "status": "pending"
  },
  "meta": {
    "requestId": "req-302",
    "timestamp": "2024-01-15T10:46:00Z",
    "processingTime": 23
  }
}
```

---

### 3. Get Notification Status (Obter status da notificação)

```bash
curl -X GET http://localhost:3000/notifications/notif-550e8400 \
  -H "Authorization: Bearer <accessToken>"
```

**Response (200):**
```json
{
  "data": {
    "notificationId": "notif-550e8400",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "type": "email",
    "status": "sent",
    "recipient": "user@example.com",
    "subject": "Welcome to our platform!",
    "createdAt": "2024-01-15T10:45:00Z",
    "sentAt": "2024-01-15T10:45:05Z",
    "retries": 0
  },
  "meta": {
    "requestId": "req-303",
    "timestamp": "2024-01-15T10:47:00Z",
    "processingTime": 12
  }
}
```

---

### 4. List Notifications (Listar notificações)

```bash
curl -X GET "http://localhost:3000/notifications?userId=550e8400-e29b-41d4-a716-446655440000&limit=20&offset=0" \
  -H "Authorization: Bearer <accessToken>"
```

**Response (200):**
```json
{
  "data": {
    "data": [
      {
        "notificationId": "notif-550e8400",
        "type": "email",
        "status": "sent",
        "recipient": "user@example.com",
        "subject": "Welcome",
        "createdAt": "2024-01-15T10:45:00Z",
        "sentAt": "2024-01-15T10:45:05Z"
      }
    ],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 145
    }
  },
  "meta": {
    "requestId": "req-304",
    "timestamp": "2024-01-15T10:48:00Z",
    "processingTime": 87
  }
}
```

---

### 5. Get Email Templates (Obter templates de email)

```bash
curl -X GET http://localhost:3000/notifications/templates
```

**Response (200):**
```json
{
  "data": [
    {
      "templateId": "tpl-001",
      "name": "welcome_email",
      "type": "email",
      "subject": "Welcome {{name}}!",
      "body": "Thanks for signing up, {{name}}!"
    },
    {
      "templateId": "tpl-002",
      "name": "password_reset",
      "type": "email",
      "subject": "Reset your password",
      "body": "Click here to reset: {{resetLink}}"
    },
    {
      "templateId": "tpl-003",
      "name": "email_verification",
      "type": "email",
      "subject": "Verify your email",
      "body": "Your verification code is: {{code}}"
    }
  ],
  "meta": {
    "requestId": "req-305",
    "timestamp": "2024-01-15T10:49:00Z",
    "processingTime": 34
  }
}
```

---

## 🏥 Health Checks

### API Gateway Health

```bash
curl -X GET http://localhost:3000/gateway/health
```

---

### Service Health Checks

```bash
# Auth Service
curl -X GET http://localhost:3001/health

# User Service
curl -X GET http://localhost:3002/health

# Notification Service
curl -X GET http://localhost:3003/health
```

---

## 📝 Notes

- Replace `<accessToken>` and `<refreshToken>` with actual tokens from login
- All endpoints accept `X-Request-Id` header (auto-generated if missing)
- Request IDs can be used for tracing in logs
- Use test credentials for initial testing
- Timestamps are in ISO8601 format (UTC)
- Processing times in milliseconds
