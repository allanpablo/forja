# Security Architecture

## Authentication Flow
```
1. User enters credentials (frontend)
2. Frontend POST /api/users/login
3. Backend verifies password, generates JWT
4. Frontend stores JWT in localStorage
5. Frontend sends JWT in Authorization header (Bearer token)
6. Backend JwtGuard validates token in protected routes
```

## JWT Implementation
- Algorithm: HS256
- Expiry: 24 hours
- Refresh tokens: 7 days (stored in httpOnly cookie if SSR needed)
- Secret: From environment variable (never commit)

## Password Security
- Hashing: bcrypt with 10+ rounds
- Never store plaintext passwords
- Password reset via email token (5 min expiry)

## API Security

### CORS
```typescript
CorsModule.register({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
});
```

### Rate Limiting
- 100 requests/minute per IP
- 10 login attempts/5 minutes
- Implemented via nestjs-throttler

### Input Validation
- All DTOs validated with class-validator
- SQL injection prevention via parameterized queries (TypeORM)
- XSS prevention: React auto-escapes, but sanitize user content

### HTTPS
- Enforced in production
- Redirect HTTP → HTTPS
- HSTS headers enabled

## Authorization
- Role-based access control (RBAC)
- JwtGuard → RolesGuard for protected endpoints
- Admin endpoints check role === 'admin'

## Secrets Management
- Never commit `.env` files
- Use `.env.example` for documentation
- Environment variables loaded at startup
- Secrets stored in CI/CD secrets (GitHub Actions)
