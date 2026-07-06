# 🔐 Auth Service - Bounded Context

## Responsabilidades Principais
- **Autenticação**: Login, registro, verificação de credenciais
- **Token Management**: Emissão JWT, refresh tokens, revogação
- **Password Management**: Hash com bcrypt, reset de senha
- **Session Management**: Controle de sessões ativas
- **MFA Ready**: Preparado para multi-factor authentication

## O que NÃO é responsabilidade
- ❌ Gerenciamento de perfis de usuário (→ User Service)
- ❌ Envio de notificações (→ Notification Service)
- ❌ Persistência de dados de usuário além de credenciais

---

## Bounded Context Limits

### Agregados
```
User (Aggregate Root)
├─ UserId: UUID
├─ Email: Email
├─ PasswordHash: BCryptHash
├─ CreatedAt: DateTime
├─ UpdatedAt: DateTime
└─ Status: 'active' | 'disabled' | 'deleted'

RefreshToken (Value Object)
├─ Token: String
├─ ExpiresAt: DateTime
├─ DeviceId: Optional<String>
└─ IpAddress: Optional<String>

Session (Aggregate Root)
├─ SessionId: UUID
├─ UserId: UUID
├─ DeviceInfo: String
├─ IssuedAt: DateTime
└─ ExpiresAt: DateTime
```

### Value Objects
```
JWT Claims:
- sub: UserId
- iat: IssuedAt
- exp: ExpiresAt
- type: 'access' | 'refresh'
```

---

## Domain Events Published

```
event: user.registered
  ├─ userId: UUID
  ├─ email: Email
  └─ timestamp: DateTime

event: user.authenticated
  ├─ userId: UUID
  ├─ timestamp: DateTime
  └─ ipAddress: String

event: password.reset_requested
  ├─ userId: UUID
  ├─ email: Email
  └─ resetToken: String

event: user.disabled
  ├─ userId: UUID
  └─ reason: String
```

---

## External Dependencies

### Services Called
- `POST http://user-service:3002/users` (para criar perfil ao registrar)
  - Async via RabbitMQ preferred
  - Fallback: direto se RabbitMQ offline

### External Resources
- PostgreSQL (auth_db)
- Redis (for tokens blacklist)
- RabbitMQ (for events)

---

## Invariants & Rules

### Business Rules
1. Email must be unique across all users
2. Password must be >= 8 characters, contain upper, lower, number
3. Refresh tokens must be rotated on each use
4. Access tokens expire after 15 minutes
5. Refresh tokens expire after 7 days
6. Failed login attempts are rate limited (5 attempts per 15 min)
7. Password reset links expire after 1 hour

### Technical Invariants
1. All passwords stored with bcrypt (cost: 12)
2. All tokens stored in Redis (not in database)
3. User status changes are atomic operations
4. Session IDs are cryptographically secure (UUIDs)
