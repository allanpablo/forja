# User Domain

## Domain Models
- **User Entity** — Represents a registered user
  - Fields: id, email, password, firstName, lastName, role
  - Constraints: email unique, password hashed

## API Contracts (shared-types)

### CreateUserRequest
```typescript
{
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}
```

### UserResponse
```typescript
{
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'admin';
  createdAt: Date;
}
```

### LoginRequest
```typescript
{
  email: string;
  password: string;
}
```

### LoginResponse
```typescript
{
  user: UserResponse;
  token: string;
}
```

## Business Logic
- New users default to 'user' role
- Email must be unique
- Email validation via email-validator
- Password must be > 8 characters

## Error Codes
- `USER_NOT_FOUND` — User doesn't exist
- `EMAIL_ALREADY_EXISTS` — Email taken
- `INVALID_PASSWORD` — Wrong password
- `INVALID_EMAIL` — Email format error
