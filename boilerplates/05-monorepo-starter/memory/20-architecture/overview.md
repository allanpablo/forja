# Architecture Overview

## Tech Stack

### Frontend
- **Framework**: Next.js 14+ (React 18+)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: React hooks + Context API
- **HTTP Client**: Axios
- **UI Components**: shadcn/ui

### Backend
- **Framework**: NestJS 10+
- **Language**: TypeScript
- **ORM**: TypeORM
- **Database**: PostgreSQL
- **Cache**: Redis
- **Auth**: JWT + Passport

### Shared
- **Shared Types**: TypeScript interfaces (no dependencies)
- **Shared Utils**: Helpers, validators, constants

### DevOps
- **Build System**: Turborepo
- **Containerization**: Docker
- **Orchestration**: Docker Compose
- **CI/CD**: GitHub Actions ready

## Architecture Diagram
```
┌─────────────────┐
│   Browser       │
└────────┬────────┘
         │ HTTP/HTTPS
┌────────▼────────────────────────┐
│   Next.js Frontend (Port 3000)   │
├──────────────────────────────────┤
│ • Pages (App Router)             │
│ • Components                      │
│ • API Client                      │
│ • Auth (JWT in localStorage)     │
└────────┬────────────────────────┘
         │ API calls
┌────────▼────────────────────────┐
│   NestJS Backend (Port 3001)     │
├──────────────────────────────────┤
│ • Controllers                     │
│ • Services (business logic)       │
│ • Guards (JWT validation)         │
│ • TypeORM Entities               │
└────────┬────────────────────────┘
         │ SQL
┌────────▼────────────────────────┐
│   PostgreSQL (Port 5432)         │
│   + Redis (Port 6379)            │
└─────────────────────────────────┘

Shared:
┌─────────────────────────────────┐
│ shared-types (API contracts)     │
│ shared-utils (utilities)         │
└─────────────────────────────────┘
```

## Monorepo Structure
```
packages/
├── apps/
│   ├── frontend/    # Next.js 14
│   └── backend/     # NestJS 10
└── packages/
    ├── shared-types/  # DTOs, interfaces
    └── shared-utils/  # Helpers, constants
```

## Build Pipeline
```
npm run build
  ├── shared-types (no dependencies)
  ├── shared-utils (depends on shared-types)
  ├── frontend (depends on shared-types, shared-utils)
  └── backend (depends on shared-types, shared-utils)
```
Turborepo executes in parallel where possible.
