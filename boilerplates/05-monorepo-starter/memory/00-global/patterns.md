# Architectural Patterns

## Monorepo Structure
```
packages/
├── apps/
│   ├── frontend/  # Next.js 14+ (React)
│   └── backend/   # NestJS 10+
└── packages/
    ├── shared-types/  # API & domain interfaces
    └── shared-utils/  # Utilities & helpers
```

## Package Interdependencies
```
frontend → shared-types ✓
backend → shared-types ✓
shared-utils → nothing
frontend → shared-utils ✓
backend → shared-utils ✓
```

## File Organization

### Frontend (Next.js)
- `/app` — App Router pages & layouts
- `/components` — React components
- `/lib` — Utilities, hooks, api client
- `/public` — Static assets

### Backend (NestJS)
- `/src/modules` — Feature modules (users, products, orders)
- `/src/common` — Guards, interceptors, pipes
- `/test` — Integration tests

### Shared Packages
- `/src/api` — Request/response DTOs
- `/src/domain` — Business entities
- `/src/errors` — Custom error types

## API Contract Pattern
All API endpoints defined in shared-types/src/api/:
```typescript
export interface CreateUserRequest { ... }
export interface UserResponse { ... }
```

Frontend & Backend import from shared-types.
