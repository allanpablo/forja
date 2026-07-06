# Backend Architecture (NestJS)

## Directory Structure
```
apps/backend/
├── src/
│   ├── main.ts              # Entry point
│   ├── app.module.ts        # Root module
│   ├── common/
│   │   ├── guards/          # JWT, role guards
│   │   ├── interceptors/    # Response formatting
│   │   └── pipes/           # Validation pipes
│   ├── modules/
│   │   ├── users/
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── users.module.ts
│   │   │   ├── entities/user.entity.ts
│   │   │   └── dto/
│   │   ├── products/
│   │   │   └── (similar structure)
│   │   └── orders/
│   │       └── (similar structure)
│   ├── database/
│   │   ├── migrations/      # TypeORM migrations
│   │   └── config/          # Connection config
│   └── config/              # App configuration
├── test/
│   ├── unit/                # Unit tests
│   └── integration/         # Integration tests
├── .env.example
├── ormconfig.ts             # TypeORM config
├── tsconfig.json
└── package.json
```

## Module Pattern
```typescript
// users.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
```

## Key Features
- **JWT Authentication**: Passport + JWT strategy
- **TypeORM**: Strongly-typed ORM
- **Validation**: class-validator DTOs
- **Error Handling**: Global exception filter
- **Logging**: Built-in NestJS logger

## API Endpoints

### Users
- `POST /api/users/register` — Create user
- `POST /api/users/login` — Login
- `GET /api/users/:id` — Get user profile

### Products
- `GET /api/products` — List products (paginated)
- `GET /api/products/:id` — Get product details
- `POST /api/products` — Create (admin only)

### Orders
- `POST /api/orders` — Create order
- `GET /api/orders/:id` — Get order details
- `GET /api/orders` — List user's orders

## Response Format
```json
{
  "success": true,
  "data": { ... },
  "message": "Success"
}
```

## Error Handling
```typescript
throw new NotFoundException('Product not found');
// Response: { statusCode: 404, message: 'Product not found' }
```
