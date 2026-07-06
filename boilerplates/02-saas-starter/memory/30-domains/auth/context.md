# Auth Domain Context

## O que é Auth neste SaaS?

Autenticação & autorização stateless com JWT, permitindo:
1. Signup (criar org + user)
2. Login (JWT tokens)
3. Refresh (renovar access token)
4. Logout (invalidar token em Redis)
5. Password reset (email link)

## Fluxo de Autenticação

```
User abre app
    ↓
Frontend checa localStorage.accessToken
    ↓
[Token válido?] → SIM → Mostrar dashboard
    ↓ NÃO
[Token expirado?] → NÃO → Mostrar login
    ↓ SIM
POST /api/auth/refresh com refreshToken
    ↓
[Refresh válido?] → SIM → Novo accessToken
    ↓ NÃO
Limpar tokens, mostrar login
```

## Conceitos

### JWT Structure
```
Header.Payload.Signature
eyJhbGciOiJIUzI1NiJ9.
eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Payload contém:
- `sub` (subject): user ID
- `tenantId`: organization ID
- `roles`: ['owner', 'admin'] etc
- `iat`: issued at
- `exp`: expiry timestamp

### Strategies

**Local Strategy**:
- Username/email + password
- Usado em POST /api/auth/login
- Retorna JWT

**JWT Strategy**:
- Valida token em Authorization header
- Usado em @UseGuards(JwtAuthGuard)
- Extrai dados do token payload

## Regras & Invariantes

1. **Password validation**: Min 12 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol
2. **Email validation**: RFC 5322
3. **Unique constraint**: Email único por tenant (não global)
4. **Token signing**: Secret from process.env.JWT_SECRET
5. **Token expiry**: Access 15 min, Refresh 7 days
6. **Rate limiting**: 5 failed login attempts = 15 min lockout
7. **Tenant isolation**: User pode pertencer a múltiplas orgs (multi-tenant)

## Status Atual

- ✅ JWT strategy implementada
- ✅ Local strategy implementada
- ✅ User entity com password hash
- ✅ Signup endpoint
- ✅ Login endpoint
- ✅ Refresh endpoint
- 🚧 Password reset (future)
- 🚧 MFA (future)

## Próximos Steps

1. Implementar password reset flow
2. Adicionar rate limiting
3. Webhook para email de confirmação
4. Audit logging de eventos de auth
