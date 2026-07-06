# Backend - Arquitetura NestJS

## Stack Técnico

```
Runtime: Node.js 18+
Framework: NestJS 10+
Language: TypeScript (strict mode)
Database: PostgreSQL 14+
ORM: TypeORM
Cache: Redis
API Docs: Swagger/OpenAPI
Testing: Jest
```

## Estrutura de Diretórios

```
backend/
├── src/
│   ├── main.ts                 # Entry point
│   ├── app.module.ts           # Root module
│   ├── config/
│   │   ├── database.ts         # TypeORM config
│   │   ├── cache.ts            # Redis config
│   │   └── payment.ts          # Mock Stripe
│   ├── modules/
│   │   ├── products/
│   │   │   ├── product.controller.ts
│   │   │   ├── product.service.ts
│   │   │   ├── product.repository.ts
│   │   │   ├── product.entity.ts
│   │   │   ├── category.entity.ts
│   │   │   ├── product.module.ts
│   │   │   └── dto/
│   │   │       ├── create-product.dto.ts
│   │   │       └── update-product.dto.ts
│   │   ├── cart/
│   │   ├── orders/
│   │   ├── payments/
│   │   ├── inventory/
│   │   ├── coupons/
│   │   ├── reviews/
│   │   └── auth/ (mock)
│   ├── common/
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── middleware/
│   │   │   ├── logging.middleware.ts
│   │   │   └── auth.middleware.ts
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   └── roles.decorator.ts
│   │   └── pipes/
│   │       └── validation.pipe.ts
│   ├── database/
│   │   └── migrations/
│   └── utils/
│       ├── logger.ts
│       └── helpers.ts
├── test/
│   ├── products.e2e-spec.ts
│   ├── cart.e2e-spec.ts
│   ├── checkout.e2e-spec.ts
│   └── jest-e2e.json
├── scripts/
│   ├── seed-db.mjs
│   └── setup-env.sh
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## Fluxo de Requisição

```
1. Request entra em main.ts
2. NestJS rota para o Controller apropriado
3. Validation Pipe valida DTOs
4. Controller injeta Service
5. Service executa lógica e chama Repository
6. Repository interage com PostgreSQL/Redis
7. Resposta retorna por Service → Controller
8. Exception Filter trata erros
9. Response serializada + HTTP status
```

## Módulos Detalhados

### Products Module
**Controllers**: ProductsController
**Services**: ProductsService, CategoriesService
**Entities**: Product, Category
**Endpoints**:
- `GET /api/products` - Listar com filtro/paginação
- `GET /api/products/:id` - Detalhes
- `POST /api/products` - Criar (admin)
- `PUT /api/products/:id` - Atualizar (admin)
- `DELETE /api/products/:id` - Deletar (admin)
- `GET /api/categories` - Listar categorias

### Cart Module
**Services**: CartService (in-memory + Redis)
**Endpoints**:
- `POST /api/cart/add` - Adicionar item
- `DELETE /api/cart/items/:productId` - Remover item
- `PUT /api/cart/items/:productId` - Atualizar quantidade
- `GET /api/cart` - Ver carrinho
- `POST /api/cart/apply-coupon` - Aplicar cupom
- `POST /api/cart/validate` - Validar antes de checkout

### Orders Module
**Controllers**: OrdersController
**Services**: OrdersService
**Entities**: Order, OrderItem, OrderStatus (enum)
**Endpoints**:
- `GET /api/orders` - Listar pedidos do user
- `GET /api/orders/:id` - Detalhes do pedido
- `POST /api/orders` - Criar (from checkout)
- `PUT /api/orders/:id/status` - Atualizar status (admin)

### Payments Module
**Services**: PaymentsService (mock Stripe)
**Endpoints**:
- `POST /api/payments/process` - Processar pagamento
- `GET /api/payments/:transactionId` - Detalhes do pagamento

### Inventory Module
**Services**: InventoryService
**Entities**: Inventory, StockMovement
**Endpoints**:
- `GET /api/inventory` - Stock de todos os produtos
- `POST /api/inventory/restock` - Reposição (admin)
- `PUT /api/inventory/:productId` - Atualizar stock (admin)

### Coupons Module
**Services**: CouponsService
**Endpoints**:
- `POST /api/coupons` - Criar cupom (admin)
- `GET /api/coupons/:code/validate` - Validar cupom

### Reviews Module
**Services**: ReviewsService
**Entities**: Review, Rating
**Endpoints**:
- `GET /api/products/:productId/reviews` - Listar reviews
- `POST /api/orders/:orderId/items/:itemId/review` - Criar review

## Tratamento de Exceções

```typescript
// Exemplo de fluxo
try {
  const product = await productService.getProduct(id);
  if (!product) throw new NotFoundException(`Product ${id} not found`);
} catch (error) {
  if (error instanceof NotFoundException) {
    // Exception Filter traduz para 404
  }
  if (error instanceof DatabaseError) {
    // Traduz para 500 + log
  }
}
```

## Injeção de Dependência

```typescript
// Exemplo
@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}
}
```

## Validação e DTOs

```typescript
// create-product.dto.ts
import { IsString, IsNumber, IsOptional, MinLength, Min } from 'class-validator';

export class CreateProductDTO {
  @IsString()
  @MinLength(3)
  name: string;

  @IsNumber()
  @Min(0.01)
  price: number;

  @IsOptional()
  @IsString()
  description?: string;
}
```

## Middleware de Logging e Auth

```typescript
// Middleware loga cada request com UUID
// Auth middleware valida JWT (mock para MVP)
// Exemplo:
GET /api/products?page=1&limit=20
├─ Auth: OK (mock user)
├─ Query: page=1, limit=20
└─ Response: 200, 2.5ms
```

## Cache Strategy

| Recurso | TTL | Estratégia |
|---------|-----|-----------|
| Produtos | 30min | Cache-aside com invalidação |
| Categorias | 1h | Cache completo, manual invalidation |
| Carrinho do user | 24h | Cache com user ID |
| Session JWT | 1h | Sem cache (stateless) |

## Transações ACID

```typescript
// Checkout usa transação para atomicidade
const queryRunner = dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
try {
  await queryRunner.manager.save(Order);
  await queryRunner.manager.update(Inventory, ...);
  await queryRunner.commitTransaction();
} catch (error) {
  await queryRunner.rollbackTransaction();
}
```

## Health Check

```
GET /api/health
{
  "status": "up",
  "timestamp": "2024-01-15T10:30:00Z",
  "database": "connected",
  "cache": "connected"
}
```
