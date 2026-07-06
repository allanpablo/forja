# Context Policy

## Local Development
- Root `npm run dev` starts frontend + backend + watchers
- Environment: `.env.local` for secrets, `.env.example` for docs
- Database: PostgreSQL + Redis via docker-compose

## Build & Deployment
- Turborepo caches builds and tests
- `npm run build` builds all packages in dependency order
- Docker multi-stage builds (frontend + backend in one image if needed)

## Git Workflow
- Monorepo uses conventional commits
- CI/CD runs Turborepo affected checks
- Shared code changes trigger dependent tests

## Code Review
- Shared-types changes require +2 approval (affects both apps)
- Domain logic isolated to backend modules
- UI components isolated to frontend
