# Shared Types

TypeScript interfaces and DTOs shared between frontend and backend applications.

## Features
- No external dependencies (only TypeScript types)
- API request/response contracts
- Domain entity interfaces
- Custom error types

## Directory Structure
```
src/
├── api/           # Request/response DTOs
├── domain/        # Business entity interfaces
└── errors/        # Custom error types
```

## Usage

### From Frontend
```typescript
import type { UserResponse, CreateUserRequest } from '@monorepo/shared-types';
```

### From Backend
```typescript
import type { ProductResponse, CreateProductRequest } from '@monorepo/shared-types';
```

## Principles
- Keep types simple and focused
- Avoid circular dependencies
- Document complex types
- Version types with API changes
