# 👤 User Service - API Specification

## Base URL
```
Local:      http://localhost:3002
Docker:     http://user-service:3002
Production: https://api.example.com/users
```

---

## Endpoints

### 1. Get User Profile
```http
GET /users/:userId
Authorization: Bearer <token>

Response 200 OK:
{
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "fullName": "John Doe",
    "avatar": "https://cdn.example.com/avatars/550e8400.jpg",
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

Error 404 Not Found:
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User with ID 550e8400-e29b-41d4-a716-446655440000 not found",
    "statusCode": 404
  }
}
```

---

### 2. Create User Profile
```http
POST /users
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "fullName": "John Doe",
  "avatar": "https://cdn.example.com/avatars/default.jpg"
}

Response 201 Created:
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

### 3. Update User Profile
```http
PATCH /users/:userId
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "fullName": "John Smith",
  "bio": "Updated bio",
  "avatar": "https://cdn.example.com/avatars/new.jpg"
}

Response 200 OK:
{
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "fullName": "John Smith",
    "bio": "Updated bio",
    "avatar": "https://cdn.example.com/avatars/new.jpg",
    "updatedAt": "2024-01-15T10:37:00Z"
  },
  "meta": {
    "requestId": "req-203",
    "timestamp": "2024-01-15T10:37:00Z",
    "processingTime": 89
  }
}

Error 403 Forbidden:
{
  "error": {
    "code": "UNAUTHORIZED_UPDATE",
    "message": "You can only update your own profile",
    "statusCode": 403
  }
}
```

---

### 4. Update User Settings
```http
PATCH /users/:userId/settings
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "theme": "light",
  "notificationsEnabled": false,
  "language": "pt",
  "timeZone": "America/Sao_Paulo"
}

Response 200 OK:
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

### 5. Request Email Verification
```http
POST /users/:userId/verify-email
Authorization: Bearer <token>

Request:
{}

Response 200 OK:
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

Note: This publishes event "user.verification_requested"
which triggers notification-service to send email
```

---

### 6. Confirm Email Verification
```http
POST /users/:userId/confirm-email
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "code": "123456"
}

Response 200 OK:
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

Error 400 Bad Request:
{
  "error": {
    "code": "INVALID_CODE",
    "message": "Verification code is invalid or expired",
    "statusCode": 400
  }
}
```

---

### 7. Delete User Account
```http
DELETE /users/:userId
Authorization: Bearer <token>

Response 204 No Content

Note: Performs soft delete, publishes "user.deleted" event
```

---

### 8. List Users (with pagination)
```http
GET /users?page=1&limit=10&search=john
Authorization: Bearer <token>

Response 200 OK:
{
  "data": [
    {
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "email": "john@example.com",
      "fullName": "John Doe",
      "avatar": "https://cdn.example.com/avatars/550e8400.jpg"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "pages": 5
  },
  "meta": {
    "requestId": "req-207",
    "timestamp": "2024-01-15T10:41:00Z",
    "processingTime": 145
  }
}
```

---

### 9. Health Check
```http
GET /health

Response 200 OK:
{
  "status": "UP",
  "checks": {
    "database": { "status": "UP" },
    "redis": { "status": "UP" }
  }
}
```

---

## Request/Response Schemas

### UserProfile
```typescript
interface UserProfile {
  userId: string;           // UUID
  email: string;
  fullName: string;
  avatar?: string;          // URL
  bio?: string;
  emailVerified: boolean;
  emailVerifiedAt?: string; // ISO8601
  createdAt: string;        // ISO8601
  updatedAt: string;        // ISO8601
}

interface UserSettings {
  theme: 'light' | 'dark' | 'auto';
  notificationsEnabled: boolean;
  language: string;         // 'en', 'pt', 'es'
  timeZone: string;         // IANA timezone
}
```
