# Monorepo Starter

A production-ready full-stack monorepo template with **Next.js 14** frontend, **NestJS 10** backend, and shared TypeScript packages managed with **Turborepo**.

## 🎯 Features

- ✅ **Monorepo Structure** — Single repository with frontend, backend, and shared packages
- ✅ **Type-Safe APIs** — Shared TypeScript types across frontend and backend
- ✅ **Fast Builds** — Turborepo with intelligent caching
- ✅ **Zero-Friction Dev** — One command to start everything (`npm run dev`)
- ✅ **Production Ready** — Docker support, environment config, error handling
- ✅ **Scalable** — Easy to add new packages and domains

## 📦 Packages

### Apps
- **frontend** — Next.js 14 + React 18 + Tailwind CSS
  - Pages: Home, Products, Dashboard
  - API client with JWT auth
  - Server Components by default

- **backend** — NestJS 10 + TypeORM + PostgreSQL
  - Modules: Users, Products, Orders
  - JWT authentication with Passport
  - Global error handling

### Shared
- **shared-types** — TypeScript interfaces for API contracts
  - API DTOs (requests/responses)
  - Domain entities
  - Error types

- **shared-utils** — Common utilities and helpers
  - Validators (email, password, etc.)
  - String utils (slugify, formatPrice, etc.)
  - Math utils (calculations)
  - Constants

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+
- Docker & Docker Compose (for database/redis)

### 1. Clone and Install

```bash
cd boilerplates/05-monorepo-starter
npm install
```

### 2. Setup Database

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Create .env file in backend
cp packages/apps/backend/.env.example packages/apps/backend/.env
```

### 3. Run Development Mode

```bash
# Start frontend + backend + watch mode (from root)
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:3001/api
- Health check: http://localhost:3001/api/health

## 📂 Project Structure

```
monorepo/
├── packages/
│   ├── apps/
│   │   ├── frontend/          # Next.js 14
│   │   │   ├── app/           # App Router pages
│   │   │   ├── components/    # React components
│   │   │   ├── lib/           # API client, hooks
│   │   │   └── styles/        # Tailwind CSS
│   │   └── backend/           # NestJS 10
│   │       └── src/
│   │           ├── modules/   # Users, Products, Orders
│   │           └── common/    # Guards, pipes, exceptions
│   └── packages/
│       ├── shared-types/      # DTO & domain interfaces
│       └── shared-utils/      # Utilities & helpers
├── turbo.json                 # Turborepo configuration
├── tsconfig.json              # Base TypeScript config
├── package.json               # Workspace root
├── docker-compose.yml         # PostgreSQL + Redis
└── Dockerfile                 # Multi-stage production build
```

## 🔧 Commands

### Root Level
```bash
npm run dev              # Start frontend + backend (watch mode)
npm run build            # Build all packages
npm run test             # Run tests
npm run lint             # Lint all packages
npm run type-check       # TypeScript type checking
npm run clean            # Remove build artifacts
npm run format           # Format code with Prettier
```

### Frontend
```bash
cd packages/apps/frontend
npm run dev              # Start Next.js dev server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Lint code
```

### Backend
```bash
cd packages/apps/backend
npm run dev              # Start NestJS dev server (watch)
npm run build            # Build for production
npm run start            # Start production server
npm run test             # Run tests
```

### Shared Packages
```bash
cd packages/packages/shared-types
npm run build            # Build TypeScript types
npm run type-check       # Check types

cd packages/packages/shared-utils
npm run build            # Build utilities
```

## 🔐 Authentication

### JWT Flow
1. User registers → Backend generates password hash
2. User logs in → Backend returns JWT token
3. Frontend stores token in localStorage
4. Frontend sends token in `Authorization: Bearer <token>` header
5. Backend JwtGuard validates token on protected routes

### Environment Variables
Create `.env` files:

**Frontend** (`packages/apps/frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

**Backend** (`packages/apps/backend/.env`):
```
NODE_ENV=development
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=monorepo
JWT_SECRET=super-secret-key-change-in-production
```

## 📡 API Endpoints

### Users
- `POST /api/users/register` — Create account
- `POST /api/users/login` — Login
- `GET /api/users/:id` — Get profile (auth required)

### Products
- `GET /api/products` — List products (paginated)
- `GET /api/products/:id` — Get product details
- `POST /api/products` — Create (auth required)
- `PUT /api/products/:id` — Update (auth required)
- `DELETE /api/products/:id` — Delete (auth required)

### Orders
- `POST /api/orders` — Create order (auth required)
- `GET /api/orders` — List user's orders (auth required)
- `GET /api/orders/:id` — Get order details (auth required)
- `PATCH /api/orders/:id/status` — Update status (auth required)
- `DELETE /api/orders/:id` — Cancel order (auth required)

## 🏗️ Adding New Features

### Add a New Shared Type
```typescript
// packages/packages/shared-types/src/api/my-feature.ts
export interface MyFeatureRequest { ... }
export interface MyFeatureResponse { ... }

// packages/packages/shared-types/src/index.ts (add export)
export * from './api/my-feature';
```

### Add a New Backend Module
```bash
# Create module structure
mkdir -p packages/apps/backend/src/modules/my-module/{entities,dto}

# Create entity, service, controller, module
# Import in AppModule
```

### Add a New Frontend Page
```bash
# Create page directory
mkdir -p packages/apps/frontend/app/my-page

# Create page.tsx with 'use client' for interactivity
```

## 🐳 Docker

### Run with Docker Compose
```bash
# Start services (postgres + redis)
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
```

### Build Docker Image
```bash
docker build -t monorepo-starter .
docker run -p 3000:3000 -p 3001:3001 monorepo-starter
```

## 🧪 Testing

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Specific package
npm run test --workspace=backend
```

## 🚢 Production Deployment

1. Set environment variables in production
2. Build: `npm run build`
3. Start: `npm run start`
4. Or use Docker: `docker build -t my-app . && docker run my-app`

## 📚 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Next.js | 14+ |
| **Frontend UI** | React | 18+ |
| **Styling** | Tailwind CSS | 3+ |
| **Backend** | NestJS | 10+ |
| **Database ORM** | TypeORM | 0.3+ |
| **Database** | PostgreSQL | 16+ |
| **Cache** | Redis | 7+ |
| **Auth** | JWT + Passport | - |
| **Language** | TypeScript | 5.3+ |
| **Build** | Turborepo | 1.10+ |
| **Package Manager** | npm | 9+ |

## 📖 Documentation

- See `DEVELOPMENT.md` for detailed development guide
- See `memory/` for architecture decisions and domain documentation
- See individual `README.md` in each package

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Run tests and linting: `npm run test && npm run lint`
4. Type-check: `npm run type-check`
5. Create pull request

## 📝 License

MIT - Feel free to use this template for your projects!

## 🆘 Troubleshooting

**Port already in use?**
```bash
# Change ports in .env files or run on different ports
PORT=3002 npm run dev
```

**TypeScript errors?**
```bash
# Rebuild types from shared packages
npm run build --workspace=shared-types
npm run build --workspace=shared-utils
```

**Database connection errors?**
```bash
# Ensure PostgreSQL is running
docker-compose up -d postgres

# Check connection string in .env
```

---

**Happy coding! 🚀**
