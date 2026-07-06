# Exemplos de Fluxo - E-Commerce Starter

## 1️⃣ Fluxo Completo de Compra (Produto → Carrinho → Checkout → Pagamento)

### Pré-requisito
- API rodando: `docker-compose up -d`
- Base de dados alimentada com categorias e produtos

### Step 1: Verificar Health

```bash
curl -X GET http://localhost:3000/api/health
```

Resposta:
```json
{
  "status": "up",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0"
}
```

### Step 2: Listar Categorias

```bash
curl -X GET http://localhost:3000/api/categories
```

Resposta:
```json
{
  "data": [
    {
      "id": "cat-123",
      "name": "Eletrônicos",
      "slug": "eletronicos",
      "displayOrder": 1
    }
  ]
}
```

### Step 3: Listar Produtos por Categoria

```bash
curl -X GET 'http://localhost:3000/api/products?category=eletronicos&limit=5'
```

Resposta:
```json
{
  "data": [
    {
      "id": "prod-001",
      "name": "Laptop Dell XPS 13",
      "price": 1299.99,
      "discount_percent": 10,
      "finalPrice": 1169.99,
      "sku": "LAPTOP-001",
      "rating": 4.5,
      "reviewCount": 23,
      "imageUrl": "https://..."
    },
    {
      "id": "prod-002",
      "name": "Mouse Logitech MX",
      "price": 79.99,
      "discount_percent": 0,
      "finalPrice": 79.99,
      "sku": "MOUSE-001"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 5,
    "total": 45,
    "totalPages": 9
  }
}
```

### Step 4: Buscar Produtos por Filtro/Busca

```bash
# Busca por nome
curl -X GET 'http://localhost:3000/api/products?search=laptop&minPrice=1000&maxPrice=2000'

# Resultado: retorna apenas produtos que correspondem
```

### Step 5: Ver Detalhes de um Produto

```bash
curl -X GET http://localhost:3000/api/products/prod-001
```

Resposta:
```json
{
  "id": "prod-001",
  "name": "Laptop Dell XPS 13",
  "description": "Laptop ultraportátil com 13 polegadas...",
  "sku": "LAPTOP-001",
  "price": 1299.99,
  "discount_percent": 10,
  "finalPrice": 1169.99,
  "rating": 4.5,
  "reviewCount": 23,
  "imageUrl": "https://images.example.com/laptop.jpg",
  "category": {
    "id": "cat-123",
    "name": "Eletrônicos",
    "slug": "eletronicos"
  },
  "status": "active",
  "createdAt": "2024-01-10T10:30:00Z"
}
```

### Step 6: Adicionar Produto ao Carrinho

```bash
curl -X POST http://localhost:3000/api/cart/add \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod-001",
    "quantity": 1
  }'
```

Resposta:
```json
{
  "items": [
    {
      "productId": "prod-001",
      "productName": "Laptop Dell XPS 13",
      "quantity": 1,
      "pricePerUnit": 1169.99,
      "subtotal": 1169.99
    }
  ],
  "subtotal": 1169.99,
  "total": 1346.48
}
```

### Step 7: Adicionar Mais Itens ao Carrinho

```bash
curl -X POST http://localhost:3000/api/cart/add \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod-002",
    "quantity": 2
  }'
```

### Step 8: Ver Carrinho Completo

```bash
curl -X GET http://localhost:3000/api/cart
```

Resposta:
```json
{
  "items": [
    {
      "productId": "prod-001",
      "productName": "Laptop Dell XPS 13",
      "quantity": 1,
      "pricePerUnit": 1169.99,
      "subtotal": 1169.99
    },
    {
      "productId": "prod-002",
      "productName": "Mouse Logitech MX",
      "quantity": 2,
      "pricePerUnit": 79.99,
      "subtotal": 159.98
    }
  ],
  "subtotal": 1329.97,
  "discount": 0,
  "tax": 199.50,
  "total": 1529.47
}
```

### Step 9: Aplicar Cupom (Opcional)

```bash
curl -X POST http://localhost:3000/api/cart/apply-coupon \
  -H "Content-Type: application/json" \
  -d '{
    "code": "SUMMER10"
  }'
```

Resposta:
```json
{
  "items": [...],
  "subtotal": 1329.97,
  "coupon": {
    "code": "SUMMER10",
    "discountPercent": 10,
    "discountAmount": 132.997
  },
  "discount": 132.997,
  "tax": 179.55,
  "total": 1377.52
}
```

### Step 10: Validar Carrinho Antes de Checkout

```bash
curl -X POST http://localhost:3000/api/cart/validate \
  -H "Content-Type: application/json" \
  -d '{
    "shippingInfo": {
      "street": "Rua das Flores",
      "number": "123",
      "city": "São Paulo",
      "state": "SP",
      "zip": "01234-567",
      "country": "BR"
    }
  }'
```

Resposta:
```json
{
  "valid": true,
  "message": "Carrinho validado com sucesso",
  "estimatedShipping": 25.00,
  "estimatedDelivery": "2024-01-18T23:59:59Z"
}
```

### Step 11: Processar Pagamento (90% sucesso, 10% falha)

```bash
curl -X POST http://localhost:3000/api/payments/process \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1377.52,
    "method": "credit_card",
    "card": {
      "number": "4111111111111111",
      "expiry": "12/25",
      "cvc": "123",
      "holderName": "João Silva"
    },
    "shippingInfo": {
      "street": "Rua das Flores",
      "number": "123",
      "city": "São Paulo",
      "state": "SP",
      "zip": "01234-567"
    }
  }'
```

**Resposta de Sucesso (90%):**
```json
{
  "status": "approved",
  "transactionId": "txn-stripe-abc123def456",
  "orderId": "order-789xyz",
  "message": "Pagamento aprovado com sucesso",
  "createdAt": "2024-01-15T10:35:00Z"
}
```

**Resposta de Falha (10%):**
```json
{
  "status": "declined",
  "errorCode": "card_declined",
  "message": "Seu cartão foi recusado. Entre em contato com seu banco.",
  "transactionId": "txn-stripe-fail456789"
}
```

### Step 12: Listar Pedidos do Usuário

```bash
curl -X GET http://localhost:3000/api/orders \
  -H "Authorization: Bearer mock-jwt-token"
```

Resposta:
```json
{
  "data": [
    {
      "id": "order-789xyz",
      "createdAt": "2024-01-15T10:35:00Z",
      "status": "processing",
      "subtotal": 1329.97,
      "tax": 199.50,
      "discount": 132.997,
      "total": 1377.52,
      "items": [
        {
          "productId": "prod-001",
          "productName": "Laptop Dell XPS 13",
          "quantity": 1,
          "subtotal": 1169.99
        },
        {
          "productId": "prod-002",
          "productName": "Mouse Logitech MX",
          "quantity": 2,
          "subtotal": 159.98
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1 }
}
```

### Step 13: Ver Detalhes do Pedido

```bash
curl -X GET http://localhost:3000/api/orders/order-789xyz \
  -H "Authorization: Bearer mock-jwt-token"
```

Resposta:
```json
{
  "id": "order-789xyz",
  "status": "processing",
  "createdAt": "2024-01-15T10:35:00Z",
  "subtotal": 1329.97,
  "tax": 199.50,
  "discount": 132.997,
  "total": 1377.52,
  "coupon": {
    "code": "SUMMER10",
    "discountAmount": 132.997
  },
  "items": [
    {
      "id": "item-001",
      "productId": "prod-001",
      "productName": "Laptop Dell XPS 13",
      "productPrice": 1169.99,
      "quantity": 1,
      "subtotal": 1169.99,
      "canReview": false
    },
    {
      "id": "item-002",
      "productId": "prod-002",
      "productName": "Mouse Logitech MX",
      "productPrice": 79.99,
      "quantity": 2,
      "subtotal": 159.98,
      "canReview": false
    }
  ],
  "shippingAddress": {
    "street": "Rua das Flores",
    "number": "123",
    "city": "São Paulo",
    "state": "SP",
    "zip": "01234-567"
  },
  "payment": {
    "status": "approved",
    "method": "credit_card",
    "transactionId": "txn-stripe-abc123def456"
  },
  "timeline": [
    {
      "status": "pending",
      "timestamp": "2024-01-15T10:35:00Z",
      "message": "Pedido criado"
    },
    {
      "status": "processing",
      "timestamp": "2024-01-15T10:35:30Z",
      "message": "Pagamento aprovado"
    }
  ]
}
```

### Step 14: Atualizar Status do Pedido (Admin)

```bash
curl -X PUT http://localhost:3000/api/orders/order-789xyz/status \
  -H "Authorization: Bearer mock-admin-jwt" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "shipped",
    "trackingNumber": "BR123456789XYZ"
  }'
```

---

## 2️⃣ Fluxo de Avaliação de Produto (Após Entrega)

### Step 1: Listar Pedidos Entregues

```bash
curl -X GET 'http://localhost:3000/api/orders?status=delivered' \
  -H "Authorization: Bearer mock-jwt-token"
```

### Step 2: Adicionar Avaliação

```bash
curl -X POST http://localhost:3000/api/orders/order-789xyz/items/item-001/review \
  -H "Authorization: Bearer mock-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 5,
    "comment": "Excelente qualidade, muito rápido!"
  }'
```

Resposta:
```json
{
  "id": "review-123",
  "productId": "prod-001",
  "rating": 5,
  "comment": "Excelente qualidade, muito rápido!",
  "createdAt": "2024-01-18T14:20:00Z"
}
```

### Step 3: Ver Reviews do Produto

```bash
curl -X GET http://localhost:3000/api/products/prod-001/reviews
```

Resposta:
```json
{
  "data": [
    {
      "id": "review-123",
      "userId": "user-456",
      "rating": 5,
      "comment": "Excelente qualidade, muito rápido!",
      "createdAt": "2024-01-18T14:20:00Z"
    },
    {
      "id": "review-124",
      "userId": "user-789",
      "rating": 4,
      "comment": "Muito bom, mas caro",
      "createdAt": "2024-01-17T10:10:00Z"
    }
  ],
  "averageRating": 4.5,
  "totalReviews": 23
}
```

---

## 3️⃣ Fluxo de Gerenciamento de Inventário (Admin)

### Ver Estoque de um Produto

```bash
curl -X GET http://localhost:3000/api/inventory/prod-001
```

Resposta:
```json
{
  "productId": "prod-001",
  "productName": "Laptop Dell XPS 13",
  "stock": 45,
  "reserved": 3,
  "available": 42,
  "status": "in-stock",
  "reorderPoint": 10,
  "lastRestockDate": "2024-01-10T15:00:00Z"
}
```

### Reposição de Estoque

```bash
curl -X POST http://localhost:3000/api/inventory/restock \
  -H "Authorization: Bearer mock-admin-jwt" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod-001",
    "quantity": 100,
    "notes": "Pedido de reposição #PO-001"
  }'
```

Resposta:
```json
{
  "productId": "prod-001",
  "stock": 145,
  "movement": {
    "id": "mov-001",
    "type": "in",
    "quantity": 100,
    "reason": "restock",
    "createdAt": "2024-01-15T12:00:00Z"
  }
}
```

---

## 4️⃣ Fluxo de Cupons (Admin)

### Criar Cupom

```bash
curl -X POST http://localhost:3000/api/coupons \
  -H "Authorization: Bearer mock-admin-jwt" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "SUMMER10",
    "discount_percent": 10,
    "expiresAt": "2024-12-31T23:59:59Z",
    "maxUses": 100
  }'
```

### Validar Cupom

```bash
curl -X GET http://localhost:3000/api/coupons/SUMMER10/validate
```

Resposta:
```json
{
  "valid": true,
  "code": "SUMMER10",
  "discount_percent": 10,
  "message": "Cupom válido e pode ser usado"
}
```

---

## 🧪 Testando com Insomnia/Postman

Importe este arquivo de environment:

```json
{
  "name": "E-Commerce Dev",
  "values": [
    {
      "key": "base_url",
      "value": "http://localhost:3000",
      "enabled": true
    },
    {
      "key": "user_jwt",
      "value": "mock-jwt-token",
      "enabled": true
    },
    {
      "key": "admin_jwt",
      "value": "mock-admin-jwt",
      "enabled": true
    }
  ]
}
```

Use variáveis como: `{{base_url}}/api/products`

---

## ⚠️ Importante

- Mock Stripe: 90% aprovação, 10% recusa (aleatório)
- Todos os tokens JWT são mocks em desenvolvimento
- Dados são perdidos ao reiniciar containers
- Para persistência, use volumes Docker

Mais detalhes em `memory/30-domains/` 📚
