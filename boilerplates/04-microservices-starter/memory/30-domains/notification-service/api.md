# 📧 Notification Service - API Specification

## Base URL
```
Local:      http://localhost:3003
Docker:     http://notification-service:3003
Production: https://api.example.com/notifications
```

---

## Endpoints

### 1. Send Email (Sync - for urgent emails)
```http
POST /notifications/email
Content-Type: application/json

Request:
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "recipient": "user@example.com",
  "subject": "Welcome to our platform!",
  "body": "Thanks for signing up...",
  "template": "welcome_email",
  "templateVars": {
    "name": "John",
    "activationLink": "https://..."
  }
}

Response 202 Accepted:
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

Error 429 Too Many Requests:
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "User has exceeded email quota for today",
    "statusCode": 429,
    "details": {
      "limit": 100,
      "sent": 100,
      "resetAt": "2024-01-16T00:00:00Z"
    }
  }
}
```

---

### 2. Send Push Notification
```http
POST /notifications/push
Content-Type: application/json

Request:
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "title": "New message",
  "body": "You have a new message from John",
  "data": {
    "action": "open_messages",
    "sender_id": "user-123"
  }
}

Response 202 Accepted:
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

### 3. Get Notification Status
```http
GET /notifications/:notificationId
Authorization: Bearer <token>

Response 200 OK:
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

Response 404 Not Found:
{
  "error": {
    "code": "NOTIFICATION_NOT_FOUND",
    "message": "Notification with ID notif-550e8400 not found",
    "statusCode": 404
  }
}
```

---

### 4. List Notifications (for user)
```http
GET /notifications?userId=550e8400-e29b-41d4-a716-446655440000&limit=20&offset=0
Authorization: Bearer <token>

Response 200 OK:
{
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
  },
  "meta": {
    "requestId": "req-304",
    "timestamp": "2024-01-15T10:48:00Z",
    "processingTime": 87
  }
}
```

---

### 5. Get Email Templates
```http
GET /notifications/templates

Response 200 OK:
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

### 6. Health Check
```http
GET /health

Response 200 OK:
{
  "status": "UP",
  "checks": {
    "rabbitmq": { "status": "UP" },
    "redis": { "status": "UP" }
  }
}
```

---

## Event Handling (RabbitMQ Consumers)

### Event: user.registered
```json
{
  "eventType": "user.registered",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "name": "John Doe",
  "timestamp": "2024-01-15T10:30:00Z"
}

Action: Automatically send welcome email
Template: welcome_email with variables {name, activationLink}
```

### Event: password.reset_requested
```json
{
  "eventType": "password.reset_requested",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "resetToken": "token-xyz",
  "timestamp": "2024-01-15T10:31:00Z"
}

Action: Send password reset email
Template: password_reset with variables {resetLink}
```

### Event: user.verification_requested
```json
{
  "eventType": "user.verification_requested",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "verificationCode": "123456",
  "timestamp": "2024-01-15T10:32:00Z"
}

Action: Send verification code email
Template: email_verification with variables {code}
```

---

## Email Templates

### Template: welcome_email
```
Subject: Welcome {{name}}!
Body:
Thanks for signing up, {{name}}!

We're excited to have you on board. 
Click below to complete your profile:
{{activationLink}}

Best regards,
The Team
```

### Template: password_reset
```
Subject: Reset your password
Body:
Hi {{name}},

We received a request to reset your password.
Click the link below:
{{resetLink}}

This link expires in 1 hour.

If you didn't request this, ignore this email.
```

### Template: email_verification
```
Subject: Verify your email
Body:
Hi {{name}},

Your verification code is: {{code}}

Enter this code in the app to verify your email.
It expires in 24 hours.
```

---

## Status Codes & Meanings

| Status | Meaning |
|--------|---------|
| pending | Queued or being processed |
| sent | Successfully delivered to provider |
| failed | Failed after all retries |
| bounced | Hard bounce from email provider |
| read | User opened email (if tracked) |

---

## Retry Logic

```
Failure → Retry 1 (after 60s)
       → Retry 2 (after 120s)
       → Retry 3 (after 240s)
       → Failed (mark as failed, publish event)
```

Retries only on:
- Network errors
- Provider timeouts
- Rate limits from provider

No retries on:
- Invalid email address
- Hard bounces
- Authentication failures
