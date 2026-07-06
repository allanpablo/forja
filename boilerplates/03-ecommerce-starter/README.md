# E-Commerce Starter - Boilerplate Completo

Uma plataforma de e-commerce modular, escalável e pronta para produção construída com **NestJS** + **PostgreSQL** + **Redis**.

## 🎯 Características Principais

✅ **Catálogo de Produtos** - Produtos, categorias, filtros e busca  
✅ **Carrinho de Compras** - Gerenciamento de itens com persistência  
✅ **Checkout Simplificado** - Fluxo completo de compra  
✅ **Mock Stripe** - Processamento de pagamentos simulado (90% sucesso)  
✅ **Gerenciamento de Pedidos** - Rastreamento completo com status  
✅ **Controle de Inventário** - Stock management em tempo real  
✅ **Cupons de Desconto** - Aplicação de descontos  
✅ **Avaliações de Produtos** - Rating e reviews de clientes  
✅ **Documentação Memory** - 10 níveis de contexto estruturado  
✅ **API Swagger** - Documentação interativa completa  

## 🚀 Quick Start

### Pré-requisitos
- Node.js 18+
- Docker + Docker Compose
- PostgreSQL 14+ (ou via Docker)
- Redis (ou via Docker)

### 1️⃣ Clonar e Instalar

```bash
cd boilerplates/03-ecommerce-starter/backend
npm install
```

### 2️⃣ Setup com Docker

```bash
docker-compose up -d
```

Isto inicia:
- **PostgreSQL** em localhost:5432
- **Redis** em localhost:6379
- **API** em localhost:3000

### 3️⃣ Configurar .env

```bash
cp .env.example .env
```

### 4️⃣ Rodar Migrations (Futuro)

```bash
npm run migration:run
```

### 5️⃣ Seed Database (Opcional)

```bash
npm run seed
```

### 6️⃣ Iniciar Dev Server

```bash
npm run start:dev
```

### 7️⃣ Acessar Documentação

- **Swagger UI**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/api/health

## 📚 Arquitetura

```
┌─────────────────────────────────────────┐
│         Frontend (React/Vue)            │
│   Catálogo | Carrinho | Checkout       │
└────────────┬────────────────────────────┘
             │ REST API (JSON)
┌────────────▼────────────────────────────┐
│      NestJS Backend (Port 3000)         │
│  ┌─────────────────────────────────┐    │
│  │ Products | Cart | Orders        │    │
│  │ Payments | Inventory | Coupons  │    │
│  │ Reviews | Auth                  │    │
│  └─────────────────────────────────┘    │
└────────┬──────────┬──────────┬──────────┘
         │          │          │
    PostgreSQL  Redis       Stripe
    (Dados)   (Cache)    (Mock)
```

## 🔌 API Endpoints

### 📦 Produtos

```bash
# Listar produtos (com paginação/filtro)
GET /api/products?page=1&limit=20&category=electronics&minPrice=10&maxPrice=1000

# Detalhes do produto
GET /api/products/:productId

# Criar produto (admin)
POST /api/products
Content-Type: application/json
{
  "name": "Laptop",
  "price": 1299.99,
  "categoryId": "uuid",
  "sku": "LAPTOP-001"
}

# Atualizar produto (admin)
PUT /api/products/:productId

# Deletar produto (admin)
DELETE /api/products/:productId

# Listar categorias
GET /api/categories
```

### 🛒 Carrinho

```bash
# Adicionar ao carrinho
POST /api/cart/add
{
  "productId": "uuid",
  "quantity": 2
}

# Ver carrinho
GET /api/cart

# Remover item
DELETE /api/cart/items/:productId

# Atualizar quantidade
PUT /api/cart/items/:productId
{
  "quantity": 3
}

# Aplicar cupom
POST /api/cart/apply-coupon
{
  "code": "SUMMER10"
}
```

### 💳 Checkout e Pagamentos

```bash
# Validar carrinho antes de checkout
POST /api/cart/validate
{
  "shippingInfo": {
    "street": "Rua A",
    "number": "123",
    "city": "São Paulo",
    "state": "SP",
    "zip": "01234-567"
  }
}

# Processar pagamento (cria pedido automaticamente)
POST /api/payments/process
{
  "amount": 1299.99,
  "method": "credit_card",
  "card": {
    "number": "4111111111111111",
    "expiry": "12/25",
    "cvc": "123"
  }
}

Response (Success - 90%):
{
  "status": "approved",
  "transactionId": "stripe-uuid",
  "orderId": "order-uuid"
}

Response (Failure - 10%):
{
  "status": "declined",
  "errorCode": "card_declined",
  "message": "Cartão recusado"
}
```

### 📋 Pedidos

```bash
# Listar pedidos do usuário
GET /api/orders?page=1&status=processing

# Detalhes do pedido
GET /api/orders/:orderId

# Cancelar pedido
POST /api/orders/:orderId/cancel

# Atualizar status (admin)
PUT /api/orders/:orderId/status
{
  "status": "shipped",
  "trackingNumber": "BR123456789"
}
```

### 📊 Inventário

```bash
# Ver estoque de um produto
GET /api/inventory/:productId

# Listar estoque de todos (admin)
GET /api/inventory?status=low-stock

# Reposição (admin)
POST /api/inventory/restock
{
  "productId": "uuid",
  "quantity": 100
}
```

### 🎁 Cupons

```bash
# Validar cupom
GET /api/coupons/:code/validate

# Criar cupom (admin)
POST /api/coupons
{
  "code": "SUMMER10",
  "discount_percent": 10,
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

### ⭐ Avaliações

```bash
# Listar reviews de um produto
GET /api/products/:productId/reviews

# Criar review (usuário autenticado)
POST /api/orders/:orderId/items/:itemId/review
{
  "rating": 5,
  "comment": "Produto excelente!"
}
```

## 🧪 Testes

```bash
# Testes unitários
npm run test

# Testes E2E
npm run test:e2e

# Coverage
npm run test:cov
```

## 🏗️ Estrutura do Projeto

```
backend/
├── src/
│   ├── main.ts                 # Entry point
│   ├── app.module.ts           # Root module
│   ├── modules/
│   │   ├── products/           # Catálogo
│   │   ├── cart/               # Carrinho
│   │   ├── orders/             # Pedidos
│   │   ├── payments/           # Pagamentos
│   │   ├── inventory/          # Estoque
│   │   ├── coupons/            # Cupons
│   │   ├── reviews/            # Avaliações
│   │   └── auth/               # Autenticação (mock)
│   ├── common/
│   │   ├── filters/
│   │   ├── middleware/
│   │   └── decorators/
│   └── config/
├── test/                       # E2E tests
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── jest.config.js
└── .env.example

memory/                        # 10 níveis de contexto
├── 00-global/               # Missão, padrões
├── 10-product/              # Requisitos, personas
├── 20-architecture/         # Design técnico
├── 30-domains/              # Contexto por módulo
├── 40-delivery/             # Roadmap
├── 50-orchestration/        # Agentes, handoffs
├── 60-runs/                 # Logs de execução
├── 70-summaries/            # Resumos
├── 80-data/                 # Schemas
└── 90-decisions/            # ADRs
```

## 📖 Documentação

Consulte os arquivos de memory para detalhes:

- **[Visão do Produto](memory/10-product/vision.md)** - Personas, user stories
- **[Arquitetura](memory/20-architecture/overview.md)** - Design técnico
- **[Catálogo](memory/30-domains/catalog/context.md)** - Domínio de produtos
- **[Pedidos](memory/30-domains/orders/context.md)** - Domínio de orders
- **[Pagamentos](memory/30-domains/payments/context.md)** - Mock Stripe
- **[Inventário](memory/30-domains/inventory/context.md)** - Stock management
- **[Regras de Negócio](memory/10-product/business-rules.md)** - Regras do sistema

## 🔒 Segurança

✅ **Validação de entrada** - class-validator em todos os DTOs  
✅ **Sanitização** - TypeORM parameterizado (sem SQL injection)  
✅ **JWT** - Token-based auth (mock para MVP)  
✅ **HTTPS** - Obrigatório em produção  
✅ **CORS** - Configurável por ambiente  
✅ **Rate Limiting** - 100 req/min por IP  
✅ **Secrets** - Via .env (nunca em código)  

## ⚡ Performance

| Métrica | Target | Implementação |
|---------|--------|---------------|
| Listar produtos | < 200ms | Índices + Paginação + Cache |
| Busca/filtro | < 300ms | Full-text search |
| Checkout | < 500ms | Transações atômicas |
| Uptime | 99.9% | Health checks + Redis |

## 🐳 Docker Compose

```bash
# Iniciar todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f api

# Parar serviços
docker-compose down

# Remover volumes
docker-compose down -v
```

## 🚢 Deploy em Produção

### Build

```bash
docker build -t ecommerce-api:1.0 .
```

### Run

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e DB_HOST=db.example.com \
  -e DB_USERNAME=prod_user \
  -e DB_PASSWORD=*** \
  ecommerce-api:1.0
```

### Variáveis Críticas em Produção

```bash
NODE_ENV=production
DB_HOST=remote-postgres
DB_PASSWORD=complex-password
JWT_SECRET=very-secure-key
CORS_ORIGIN=https://yourshop.com
```

## 📊 Métricas de Sucesso

- ✅ Tempo de resposta < 200ms p95
- ✅ 99.9% uptime
- ✅ Suporte a 1000+ concurrent users
- ✅ 10k+ produtos no catálogo
- ✅ > 80% test coverage

## 🔄 CI/CD (Future)

Recomendado:
- **GitHub Actions** - Testes automáticos
- **Docker Registry** - Build e push de imagens
- **Kubernetes** - Orquestração de containers

## 📝 Logs

Logs estruturados em JSON:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "context": "ProductsController",
  "message": "GET /api/products",
  "duration": "45ms",
  "userId": "user-uuid"
}
```

## 🐛 Troubleshooting

### Erro de Conexão com PostgreSQL
```bash
# Verificar container
docker ps

# Logs
docker-compose logs postgres
```

### Porta 3000 em Uso
```bash
# Trocar porta em docker-compose.yml
ports:
  - "3001:3000"
```

### Build Falhando
```bash
# Limpar dependências
rm -rf node_modules
npm install

# Rebuildar
npm run build
```

## 📞 Suporte e Contribuição

- 📧 Issues via GitHub
- 🤝 Pull requests bem-vindos
- 📚 Contribuições na documentação

## 📄 Licença

MIT License - veja LICENSE para detalhes

---

**Feito com ❤️ para e-commerce moderno**

Última atualização: 2024-01-XX
