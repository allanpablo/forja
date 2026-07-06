# Mission & Vision

## Core Mission
Build a scalable, maintainable full-stack monorepo architecture supporting modern web applications with shared business logic and types across frontend and backend.

## Success Criteria
- Single source of truth for API contracts (shared-types)
- Zero-friction local development (one `npm run dev` command)
- Production-ready deployment pipeline (Docker, Turborepo cache)
- Clear boundaries between frontend, backend, and shared packages
- TypeScript end-to-end type safety

## Principles
1. **Monorepo-first**: Shared code lives in packages/, not duplicate
2. **Type-safety**: All API contracts defined in shared-types/
3. **Performance**: Turborepo cache for fast builds
4. **Scalability**: Easy to add new packages and domains
