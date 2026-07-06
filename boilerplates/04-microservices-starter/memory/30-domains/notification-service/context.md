# 📧 Notification Service - Bounded Context

## Responsabilidades Principais
- **Email Sending**: Enviar emails transacionais via provider ou mock
- **Push Notifications**: Enviar push notifications para mobile
- **Event Processing**: Consumir eventos de RabbitMQ
- **Retry Logic**: Retentar envios falhados com backoff exponencial
- **Status Tracking**: Rastrear status de notificações (sent, failed, bounced)

## O que NÃO é responsabilidade
- ❌ Gerenciar dados de usuário (→ User Service)
- ❌ Autenticação (→ Auth Service)
- ❌ Buscar templates customizados (pode ser, mas stateless preferred)

---

## Bounded Context Limits

### Agregados
```
Notification (Aggregate Root)
├─ NotificationId: UUID
├─ UserId: UUID
├─ Type: 'email' | 'push' | 'sms'
├─ Status: 'pending' | 'sent' | 'failed' | 'bounced'
├─ Recipient: Email | PhoneNumber
├─ Subject: String
├─ Body: String
├─ Template: Optional<String>
├─ Retries: Integer (0-5)
├─ LastError: Optional<String>
├─ CreatedAt: DateTime
├─ SentAt: Optional<DateTime>
└─ ExpiresAt: Optional<DateTime> (for timeout/cleanup)

NotificationTemplate (Aggregate Root)
├─ TemplateId: UUID
├─ Name: String (e.g., 'email_verification')
├─ Type: 'email' | 'push'
├─ Subject: Optional<String>
├─ Body: String (with {{placeholders}})
└─ UpdatedAt: DateTime
```

### Value Objects
```
EmailAddress: Validated format
NotificationStatus: enum
RetryPolicy: max_retries, backoff_multiplier
```

---

## Domain Events Consumed

```
From auth-service:
  event: user.registered
    └─ Send welcome email

  event: password.reset_requested
    └─ Send password reset email with link

From user-service:
  event: user.verification_requested
    └─ Send email verification code

  event: user.email_verified
    └─ Send confirmation email
```

---

## Domain Events Published

```
event: notification.sent
  ├─ notificationId: UUID
  ├─ userId: UUID
  ├─ type: 'email' | 'push'
  ├─ recipient: String
  └─ timestamp: DateTime

event: notification.failed
  ├─ notificationId: UUID
  ├─ userId: UUID
  ├─ error: String
  ├─ retries: Integer
  └─ timestamp: DateTime
```

---

## External Dependencies

### Services Called
- None (stateless, event-driven)

### External Resources
- RabbitMQ (consume events)
- Redis (cache retry counts, rate limits)
- Email Provider API (SendGrid, Mailgun, or mock for dev)
- Push Provider API (Firebase Cloud Messaging, or mock for dev)

---

## Invariants & Rules

### Business Rules
1. Each notification type has max retries limit (default: 3)
2. Retry delay uses exponential backoff: 60s, 120s, 240s
3. Notifications expire after 24 hours if not sent
4. Rate limiting: max 100 emails per user per day
5. SMS requires phone number verification first
6. Push notifications require device registration first

### Technical Invariants
1. All timestamps in UTC
2. Status transitions are one-way (can't go back)
3. Templates are versioned (immutable after creation)
4. Delivery receipts from providers are idempotent (deduplicated by notificationId)
