# Development Guide

Complete guide for developers setting up and working with the Monorepo Starter.

## 📋 Initial Setup

### 1. Install Dependencies

```bash
cd /path/to/05-monorepo-starter
npm install
```

This installs:
- Root dependencies (turbo, typescript, prettier)
- All workspace packages and their dependencies

### 2. Configure Environment Variables

**Frontend** (`packages/apps/frontend/.env.local`):
```bash
cp packages/apps/frontend/.env.example packages/apps/frontend/.env.local
# Edit .env.local if needed (usually OK as-is)
```

**Backend** (`packages/apps/backend/.env`):
```bash
cp packages/apps/backend/.env.example packages/apps/backend/.env
# Edit .env if needed
```

### 3. Start Services

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Verify services are running
docker-compose ps
```

## 🚀 Development Workflow

### Start Development Servers

From repository root:
```bash
npm run dev
```

This starts:
- ✅ Frontend on http://localhost:3000 (Next.js dev server with hot reload)
- ✅ Backend on http://localhost:3001 (NestJS dev server with hot reload)
- ✅ Watch mode for all packages

### Test a New Feature

**Example: Create a user**

1. Open http://localhost:3000
2. Navigate to backend API: http://localhost:3001/api/users/login
3. Test endpoint with curl:

```bash
curl -X POST http://localhost:3001/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### Check API Health

```bash
curl http://localhost:3001/api/health
# Response: { "status": "ok", "timestamp": "...", "service": "monorepo-backend" }
```

## 📝 Adding Features

### 1. Add Shared Type

**Step 1**: Define type in shared-types
```typescript
// packages/packages/shared-types/src/api/my-feature.ts
export interface MyFeatureRequest {
  name: string;
  description: string;
}

export interface MyFeatureResponse {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
}
```

**Step 2**: Export from index
```typescript
// packages/packages/shared-types/src/index.ts
export * from './api/my-feature';
```

**Step 3**: Use in frontend and backend
```typescript
// Frontend
import type { MyFeatureResponse } from '@monorepo/shared-types';

// Backend
import type { MyFeatureRequest } from '@monorepo/shared-types';
```

### 2. Add Backend Endpoint

**Step 1**: Create entity
```typescript
// packages/apps/backend/src/modules/my-module/entities/my-feature.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('my_features')
export class MyFeature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;
}
```

**Step 2**: Create DTO
```typescript
// packages/apps/backend/src/modules/my-module/dto/index.ts
import { IsString } from 'class-validator';
import type { MyFeatureRequest } from '@monorepo/shared-types';

export class CreateMyFeatureDto implements MyFeatureRequest {
  @IsString()
  name: string;

  @IsString()
  description: string;
}
```

**Step 3**: Create service
```typescript
// packages/apps/backend/src/modules/my-module/my-feature.service.ts
@Injectable()
export class MyFeatureService {
  constructor(
    @InjectRepository(MyFeature)
    private repository: Repository<MyFeature>
  ) {}

  async create(dto: CreateMyFeatureDto): Promise<MyFeatureResponse> {
    const entity = this.repository.create(dto);
    await this.repository.save(entity);
    return this.toResponse(entity);
  }
}
```

**Step 4**: Create controller
```typescript
// packages/apps/backend/src/modules/my-module/my-feature.controller.ts
@Controller('my-features')
export class MyFeatureController {
  constructor(private service: MyFeatureService) {}

  @Post()
  async create(@Body() dto: CreateMyFeatureDto) {
    return { success: true, data: await this.service.create(dto) };
  }
}
```

**Step 5**: Create and register module
```typescript
// packages/apps/backend/src/modules/my-module/my-module.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([MyFeature])],
  controllers: [MyFeatureController],
  providers: [MyFeatureService],
})
export class MyModuleModule {}

// In app.module.ts
@Module({
  imports: [
    // ... other imports
    MyModuleModule,
  ],
})
export class AppModule {}
```

### 3. Add Frontend Component

**Step 1**: Create component
```typescript
// packages/apps/frontend/components/features/my-feature-form.tsx
'use client';

import { useState } from 'react';
import type { MyFeatureRequest } from '@monorepo/shared-types';

export default function MyFeatureForm() {
  const [formData, setFormData] = useState<MyFeatureRequest>({
    name: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // API call here
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        placeholder="Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        className="w-full px-4 py-2 border rounded"
      />
      {/* ... more fields */}
      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
        Create
      </button>
    </form>
  );
}
```

**Step 2**: Use in page
```typescript
// packages/apps/frontend/app/my-features/page.tsx
import MyFeatureForm from '@/components/features/my-feature-form';

export default function MyFeaturesPage() {
  return (
    <div>
      <h1>My Features</h1>
      <MyFeatureForm />
    </div>
  );
}
```

## 🐛 Debugging

### View Logs

**Frontend logs** (in browser console):
```javascript
// http://localhost:3000 → Open DevTools (F12)
```

**Backend logs** (in terminal):
```bash
# Logs appear in terminal where npm run dev was executed
# Look for [NestJS] or service logs
```

### Database Inspection

```bash
# Connect to PostgreSQL
psql -h localhost -U postgres -d monorepo

# List tables
\dt

# View users table
SELECT * FROM users;

# Exit
\q
```

### Redis Inspection

```bash
# Connect to Redis
redis-cli

# Check keys
KEYS *

# Get value
GET jwt_token_key

# Exit
EXIT
```

## 🧪 Testing

### Run All Tests
```bash
npm run test
```

### Run Specific Package Tests
```bash
npm run test --workspace=backend
npm run test --workspace=shared-types
```

### Watch Mode
```bash
npm run test:watch
```

### Example Unit Test (Backend)
```typescript
// packages/apps/backend/src/modules/users/users.service.spec.ts
import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UsersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

## 🔍 Type Checking

Check types without building:
```bash
npm run type-check
```

This runs `tsc --noEmit` on all packages.

## 🎨 Linting & Formatting

### Format Code
```bash
npm run format
```

Formats all TypeScript, JSON, and Markdown files with Prettier.

### Check Formatting
```bash
npm run format:check
```

Verify files are formatted correctly without modifying.

## 📦 Building for Production

### Build All Packages
```bash
npm run build
```

Creates:
- `packages/packages/shared-types/dist/` — Compiled TypeScript
- `packages/packages/shared-utils/dist/` — Compiled TypeScript
- `packages/apps/frontend/.next/` — Next.js build
- `packages/apps/backend/dist/` — NestJS build

### Build Specific Package
```bash
npm run build --workspace=backend
npm run build --workspace=frontend
```

## 🐳 Docker & Deployment

### Local Docker Compose
```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f postgres

# Recreate volumes (careful!)
docker-compose down -v
```

### Build Docker Image
```bash
# Build image
docker build -t monorepo-starter:latest .

# Run image
docker run -p 3000:3000 -p 3001:3001 monorepo-starter:latest

# Run with environment
docker run \
  -e NODE_ENV=production \
  -e JWT_SECRET=production-secret \
  -e DB_HOST=external-db-host \
  -p 3000:3000 \
  -p 3001:3001 \
  monorepo-starter:latest
```

## 🆘 Common Issues

### "Port 3000 already in use"
```bash
# Kill process on port 3000
lsof -i :3000
kill -9 <PID>

# Or run on different port
PORT=3002 npm run dev
```

### "Cannot find module '@monorepo/shared-types'"
```bash
# Rebuild shared packages
npm run build --workspace=shared-types
npm run build --workspace=shared-utils

# Clear Next.js cache
rm -rf packages/apps/frontend/.next

# Restart dev server
npm run dev
```

### "Database connection refused"
```bash
# Check Docker services
docker-compose ps

# Start if not running
docker-compose up -d

# Verify connection
psql -h localhost -U postgres -c "SELECT 1"
```

### "TypeScript compilation errors"
```bash
# Type-check all packages
npm run type-check

# Or specific package
npm run type-check --workspace=backend

# Fix issues and rebuild
npm run build
```

## 📚 Resources

- [Next.js 14 Documentation](https://nextjs.org/docs)
- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Documentation](https://typeorm.io)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)

---

**Need help?** Check individual package READMEs or review memory/ documentation.
