# 👤 User Service - Bounded Context

## Responsabilidades Principais
- **User Profiles**: Gerenciar dados públicos do usuário (nome, avatar, bio)
- **Email Verification**: Validar e marcar email como verificado
- **User Preferences**: Configurações de tema, notificações, idioma
- **User Listing**: Busca e paginação de usuários
- **Profile Cleanup**: Exclusão de dados ao deletar usuário

## O que NÃO é responsabilidade
- ❌ Autenticação e JWT (→ Auth Service)
- ❌ Senhas e credenciais (→ Auth Service)
- ❌ Envio de notificações (→ Notification Service)

---

## Bounded Context Limits

### Agregados
```
UserProfile (Aggregate Root)
├─ UserId: UUID (foreign key ref)
├─ Email: Email
├─ FullName: String (max 100)
├─ Avatar: Optional<URL>
├─ Bio: Optional<String> (max 500)
├─ EmailVerified: Boolean
├─ EmailVerifiedAt: Optional<DateTime>
├─ CreatedAt: DateTime
├─ UpdatedAt: DateTime
└─ DeletedAt: Optional<DateTime> (soft delete)

UserSettings (Value Object)
├─ Theme: 'light' | 'dark' | 'auto'
├─ NotificationsEnabled: Boolean
├─ Language: 'en' | 'pt' | 'es'
└─ TimeZone: String (e.g., 'America/Sao_Paulo')

EmailVerification (Aggregate Root)
├─ VerificationId: UUID
├─ UserId: UUID
├─ Code: String (6 digits)
├─ ExpiresAt: DateTime
└─ VerifiedAt: Optional<DateTime>
```

### Value Objects
```
Email: Validated format, unique constraint
UserName: 3-50 characters, alphanumeric + underscores
```

---

## Domain Events Published

```
event: user.profile_created
  ├─ userId: UUID
  ├─ email: Email
  └─ timestamp: DateTime

event: user.email_verified
  ├─ userId: UUID
  └─ timestamp: DateTime

event: user.profile_updated
  ├─ userId: UUID
  ├─ changes: { field: oldValue, field: newValue }
  └─ timestamp: DateTime

event: user.deleted
  ├─ userId: UUID
  ├─ reason: String
  └─ timestamp: DateTime
```

---

## Events Consumed

```
Subscription: auth-service.events
  event: user.registered
    └─ Create initial user profile

Subscription: notification-service.events
  event: notification.sent (email_verification)
    └─ Update in our cache
```

---

## External Dependencies

### Services Called
- None synchronously (prefer async via events)
- Optional async call to Auth Service to verify user still exists

### External Resources
- PostgreSQL (users_db)
- Redis (for profile caching, 1h TTL)

---

## Invariants & Rules

### Business Rules
1. Email must be unique and match auth-service records
2. Profile cannot be created without registered auth account
3. Soft deletes only (never hard delete, maintain audit trail)
4. Email verification code expires after 24 hours
5. User can verify email maximum 3 times per day
6. Profile updates are timestamped for audit

### Technical Invariants
1. UserId references are immutable after creation
2. Emails are case-insensitive (lowercase on store)
3. All timestamps in UTC
4. Soft-deleted users excluded from queries by default
