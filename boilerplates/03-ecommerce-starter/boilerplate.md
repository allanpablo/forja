# E-Commerce Starter Boilerplate

Este é o boilerplate de e-commerce completo gerado pelo `create-memory-nest-kit`.

## Estrutura

```
03-ecommerce-starter/
├── README.md                 # Documentação principal
├── FLOW_EXEMPLOS.md         # Exemplos de API com curl
├── .gitignore               # Git ignore
│
├── memory/                  # 10 níveis de contexto (estrutura-padrão)
│   ├── 00-global/          # Missão, padrões, contexto
│   ├── 10-product/         # Visão, personas, regras
│   ├── 20-architecture/    # Design técnico
│   ├── 30-domains/         # Contexto por domínio
│   │   ├── catalog/        # Produtos e categorias
│   │   ├── orders/         # Pedidos
│   │   ├── payments/       # Pagamentos
│   │   └── inventory/      # Estoque
│   ├── 40-delivery/        # Roadmap (futuro)
│   ├── 50-orchestration/   # Agentes, handoffs (futuro)
│   ├── 60-runs/            # Logs de execução (futuro)
│   ├── 70-summaries/       # Resumos (futuro)
│   ├── 80-data/            # Schemas PostgreSQL
│   └── 90-decisions/       # ADRs
│
├── backend/                 # Aplicação NestJS
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   └── modules/
│   │       ├── products/    # Catálogo
│   │       ├── cart/        # Carrinho
│   │       ├── orders/      # Pedidos
│   │       ├── payments/    # Pagamentos
│   │       ├── inventory/   # Inventário
│   │       ├── coupons/     # Cupons
│   │       ├── reviews/     # Avaliações
│   │       └── auth/        # Autenticação (mock)
│   ├── test/
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.js
│   └── .env.example
│
├── agents/                  # Agentes AI (futuro)
├── skills/                  # Skills customizadas (futuro)
└── prompts/                 # Prompts para agentes (futuro)
```

## Quick Start

```bash
cd backend
docker-compose up -d
cp .env.example .env
npm install
npm run start:dev
```

Acesse: http://localhost:3000/docs

## Documentação

Consulte `memory/` para detalhes completos:

- **Visão** → `memory/10-product/vision.md`
- **Arquitetura** → `memory/20-architecture/overview.md`
- **Domínios** → `memory/30-domains/*/context.md`
- **API Exemplos** → `FLOW_EXEMPLOS.md`

## Endpoints Principais

```bash
# Produtos
GET /api/products
GET /api/products/:id
POST /api/products (admin)

# Carrinho
POST /api/cart/add
GET /api/cart
POST /api/cart/apply-coupon

# Checkout
POST /api/payments/process

# Pedidos
GET /api/orders
GET /api/orders/:id
PUT /api/orders/:id/status (admin)
```

## Stack

- **Runtime**: Node.js 18+
- **Framework**: NestJS 10
- **Language**: TypeScript
- **DB**: PostgreSQL 14
- **Cache**: Redis (future)
- **API Docs**: Swagger/OpenAPI

## Testes

```bash
npm run test          # Unitários
npm run test:e2e      # E2E
npm run test:cov      # Coverage
```

## Deploy

```bash
docker build -t ecommerce-api:1.0 .
docker run -p 3000:3000 --env-file .env ecommerce-api:1.0
```

## Autores

Criado com ❤️ pelo `create-memory-nest-kit` CLI

---

**Nota**: Este é um boilerplate educacional. Para produção, adicionar autenticação real, PCI compliance, e integração com Stripe real.
