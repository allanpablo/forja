# Padrões & Convenções do Projeto SaaS Starter

## Code Patterns

### 1. Estrutura de Módulo

Cada módulo segue este padrão:

```
modules/
  ├── domain-name/
      ├── entities/
      │   └── domain.entity.ts        # Typeorm entity
      ├── dto/
      │   ├── create-domain.dto.ts
      │   └── update-domain.dto.ts
      ├── domain.service.ts            # Lógica de negócio
      ├── domain.controller.ts         # Endpoints HTTP
      └── domain.module.ts             # Module definition
```

### 2. Service Pattern

```typescript
@Injectable()
export class DomainService {
  constructor(
    @InjectRepository(DomainEntity)
    private readonly repo: Repository<DomainEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async create(dto: CreateDomainDto): Promise<DomainEntity> {
    const tenantId = this.tenantContext.getTenantId();
    return this.repo.save({
      ...dto,
      tenantId,
    });
  }
}
```

### 3. Controller Pattern

```typescript
@Controller('api/domains')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DomainController {
  constructor(private readonly service: DomainService) {}

  @Post()
  @Roles('admin', 'owner')
  create(@Body() dto: CreateDomainDto) {
    return this.service.create(dto);
  }
}
```

### 4. Tenant Context

- Injetado via middleware no request
- Validado no JwtStrategy
- Isolado por request usando Async Local Storage
- Sempre incluído em queries do banco

### 5. RBAC (Role-Based Access Control)

**Roles:**
- `owner` — full access, billing, team management
- `admin` — module management, user invites
- `member` — read + limited operations

**Decorator:**
```typescript
@Roles('owner', 'admin')
async update(@Param('id') id: string) { }
```

### 6. Error Handling

```typescript
throw new BadRequestException('Invalid subscription plan');
throw new ForbiddenException('Only organization owners can manage billing');
throw new UnauthorizedException('Invalid credentials');
```

### 7. Validation

- Class-validator para DTOs
- Custom validators para regras de negócio
- Pipes no controller

## Database Patterns

### 1. Tenant Isolation

Todas as entidades têm `tenantId`:
```typescript
@Entity()
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  // ...
}
```

### 2. Soft Deletes

Entidades com dados sensíveis usam soft delete:
```typescript
@DeleteDateColumn()
deletedAt?: Date;
```

### 3. Indexes

```typescript
@Index(['tenantId', 'email'])
@Index(['tenantId', 'status'])
```

## API Conventions

### 1. Response Format

```json
{
  "data": { /* resource */ },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "version": "1.0"
  }
}
```

### 2. Error Response

```json
{
  "error": "RESOURCE_NOT_FOUND",
  "message": "Organization not found",
  "statusCode": 404,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 3. List Response

```json
{
  "data": [ /* items */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

## Testing Conventions

### 1. Unit Tests

- Usar `jest` com `@testing-library/nestjs`
- Mock services com `jest.Mock`
- Testar apenas a unidade, não integração

### 2. E2E Tests

```typescript
describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Setup
  });

  it('should signup user', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ email, password });
    
    expect(response.status).toBe(201);
    expect(response.body.data.accessToken).toBeDefined();
  });
});
```

## Naming Conventions

- **Services**: `PascalCase + Service` (AuthService, SubscriptionService)
- **Controllers**: `PascalCase + Controller` (AuthController)
- **Entities**: `PascalCase + Entity` (UserEntity)
- **DTOs**: `PascalCase + Dto` (CreateUserDto)
- **Routes**: kebab-case (/api/auth/sign-up)
- **Fields**: camelCase (firstName, tenantId, createdAt)

## Commit Message Format

```
feat: add subscription upgrade endpoint

- Add POST /api/subscriptions/:id/upgrade
- Validate plan compatibility
- Record billing event
- Send confirmation email

Closes #123
```

## Documentation Requirements

Every module must have:
1. README.md with module purpose
2. Context document in memory/30-domains/
3. API documentation (Swagger/OpenAPI)
4. Example curl requests
5. Error codes and meanings
