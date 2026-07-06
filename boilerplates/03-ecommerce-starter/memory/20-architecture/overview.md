# Arquitetura Geral - Overview

## Visão de Componentes

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React/Vue)                │
│  (Catálogo, Carrinho, Checkout, Meu Perfil)             │
└────────────┬────────────────────────────────────────────┘
             │ REST API (HTTPS)
┌────────────▼────────────────────────────────────────────┐
│                  NestJS Backend (Node)                  │
│  ┌──────────────┬──────────────┬──────────────┐         │
│  │ Products     │ Orders       │ Payments     │         │
│  │ Cart         │ Inventory    │ Reviews      │         │
│  │ Coupons      │ Auth         │ Categories   │         │
│  └──────────────┴──────────────┴──────────────┘         │
└────────┬────────────────────┬────────────┬──────────────┘
         │                    │            │
    PostgreSQL           Redis Cache   (Stripe/Mock)
    (Persistência)       (Performance)  (Pagamentos)
```

## Fluxo Principal de Compra

```
1. Cliente consulta catálogo
   GET /api/products → [Product]

2. Filtra/busca por categoria
   GET /api/products?category=electronics → [Product]

3. Adiciona ao carrinho
   POST /api/cart/add { productId, qty } → Cart

4. Revisa carrinho
   GET /api/cart → Cart { items, total }

5. Aplica cupom (opcional)
   POST /api/cart/apply-coupon { code } → Cart

6. Inicia checkout
   POST /api/checkout/validate → { valid: true|false }

7. Processa pagamento
   POST /api/payments/process { cart, shippingInfo } → { orderId, status }

8. Cria pedido (automático na transação do pagamento)
   POST /api/orders { orderId, items, total } → Order { status: 'processing' }

9. Cliente consulta pedido
   GET /api/orders/:orderId → Order { status, items, timeline }
```

## Camadas Técnicas

### 1. **Presentation Layer (Controllers)**
- Validação de entrada (DTOs com class-validator)
- Tradução de request → domain
- Serialização de response
- Status HTTP apropriados

### 2. **Business Logic Layer (Services)**
- Regras de negócio
- Orquestração entre repositórios
- Cálculos (preço total, desconto, imposto)
- Transações ACID

### 3. **Data Access Layer (Repositories)**
- Operações CRUD genéricas
- Queries complexas (filtro, busca, agregação)
- Sem lógica de negócio

### 4. **Infrastructure Layer**
- PostgreSQL (persistência)
- Redis (cache)
- Configuration (DB connection, env vars)

## Módulos Principais

| Módulo | Responsabilidade | Entidades |
|--------|------------------|-----------|
| **Products** | Catálogo de produtos | Product, Category |
| **Cart** | Carrinho (session/client) | Cart, CartItem (in-memory + Redis) |
| **Orders** | Pedidos e lifecycle | Order, OrderItem, OrderStatus |
| **Payments** | Processamento de pagamentos | Payment, PaymentStatus |
| **Inventory** | Gerenciamento de stock | Inventory, StockMovement |
| **Coupons** | Códigos de desconto | Coupon, CouponUsage |
| **Reviews** | Avaliações de produtos | Review, Rating |
| **Auth** | Autenticação/autorização | User (mock), JwtToken |

## Fluxo de Transação Crítica (Checkout → Pagamento → Pedido)

```
1. Validar carrinho (stock, cupom, cliente)
2. BEGIN TRANSACTION
   a. Reservar stock (UPDATE inventory SET reserved = reserved + qty)
   b. Processar pagamento (mock Stripe)
      - Sucesso: criar Order com status 'processing'
      - Falha: ROLLBACK, liberar stock
   c. Se sucesso: atualizar inventory (stock -= qty, reserved = 0)
   d. Limpar carrinho
3. COMMIT TRANSACTION
4. Retornar { orderId, status: 'processing' }
5. (Future) Enviar email de confirmação
```

## Padrões de Design

- **Repository Pattern**: Abstração de dados
- **Service Pattern**: Lógica de negócio reutilizável
- **DTO Pattern**: Validação e serialização
- **Middleware Pattern**: Logging, auth, error handling
- **Decorator Pattern**: Guards, roles, validation

## Tratamento de Erros

```
Erro                          HTTP Status   Ação
─────────────────────────────────────────────────
Produto não encontrado        404           Retornar erro
Stock insuficiente            400           Sugerir qtd máxima
Cupom inválido/expirado       400           Rejeitar
Pagamento recusado            402           Retry user
Servidor erro interno         500           Log + retry
```

## Observabilidade

- **Logs**: Estruturados (JSON) com trace ID
- **Health Check**: `/api/health` → {status, timestamp, db: ok|fail}
- **Métricas**: (Future) Prometheus em `/metrics`
- **Traces**: (Future) Jaeger para distributed tracing
