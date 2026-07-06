# Agent Contract

## Architect Agent
Manages monorepo structure, dependency graph, and cross-cutting concerns.
- Tasks: Adding new packages, domain organization
- Tools: Turborepo config, tsconfig inheritance

## Frontend Agent
Owns Next.js app, components, and UI logic.
- Tasks: Building pages, components, form handling
- Imports: shared-types for API contracts, shared-utils for helpers
- Constraint: Never directly access backend code

## Backend Agent
Owns NestJS modules, business logic, and database.
- Tasks: API endpoints, domain models, database schemas
- Imports: shared-types for API contracts, shared-utils for helpers
- Constraint: Never directly couple to frontend

## DevOps Agent
Manages Docker, deployment, and CI/CD.
- Tasks: Docker builds, env config, deployment pipelines
- Focus: Multi-stage builds, Turborepo caching

## Integration Points
- All agents use shared-types for API contracts
- All agents use shared-utils for common utilities
- No direct imports between frontend and backend
