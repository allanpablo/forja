# Auth API Specification

## Endpoints

### 1. Signup

**POST** `/api/auth/signup`

```json
{
  "email": "founder@example.com",
  "password": "SecureP@ss123",
  "organizationName": "My Startup"
}
```

**Response 201**:
```json
{
  "data": {
    "id": "user-uuid",
    "email": "founder@example.com",
    "organization": {
      "id": "org-uuid",
      "name": "My Startup",
      "plan": "free"
    },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

**Error 400**: Email já existe
**Error 422**: Senha fraca

---

### 2. Login

**POST** `/api/auth/login`

```json
{
  "email": "founder@example.com",
  "password": "SecureP@ss123"
}
```

**Response 200**:
```json
{
  "data": {
    "user": { "id", "email", "roles": ["owner"] },
    "organization": { "id", "name", "plan" },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

**Error 401**: Email ou senha inválida
**Error 429**: Too many attempts (rate limited)

---

### 3. Refresh Token

**POST** `/api/auth/refresh`

```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response 200**:
```json
{
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..." // new if rotated
  }
}
```

**Error 401**: Refresh token inválido ou expirado

---

### 4. Logout

**POST** `/api/auth/logout`

Headers: `Authorization: Bearer {accessToken}`

**Response 200**:
```json
{
  "message": "Logged out successfully"
}
```

---

### 5. Get Current User

**GET** `/api/auth/me`

Headers: `Authorization: Bearer {accessToken}`

**Response 200**:
```json
{
  "data": {
    "id": "user-uuid",
    "email": "founder@example.com",
    "roles": ["owner"],
    "organization": {
      "id": "org-uuid",
      "name": "My Startup",
      "plan": "free"
    }
  }
}
```

---

## Error Codes

| Code | Message | Meaning |
|------|---------|---------|
| AUTH_001 | Invalid credentials | Email ou senha incorreta |
| AUTH_002 | Email already exists | Email já cadastrado neste tenant |
| AUTH_003 | Weak password | Senha não atende requisitos |
| AUTH_004 | Invalid token | JWT inválido ou expirado |
| AUTH_005 | Token expired | Usar refresh endpoint |
| AUTH_006 | Account locked | 5 failed attempts, tente em 15 min |
| AUTH_007 | Email not verified | Confirmar email primeiro |

## Flow Examples

### Scenario: User Signup
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "founder@example.com",
    "password": "SecureP@ss123",
    "organizationName": "My Startup"
  }'
```

### Scenario: User Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "founder@example.com",
    "password": "SecureP@ss123"
  }'
```

### Scenario: Access Protected Route
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGc..."
```

### Scenario: Refresh Expired Token
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGc..."
  }'
```

## Implementation Notes

- Todos endpoints retornam `tenantId` no JWT payload
- Todas operações são isoladas por tenant
- Email é único por tenant, não globalmente
- Passwords são hashed com bcrypt (cost=12)
- Tokens são signed com HS256
