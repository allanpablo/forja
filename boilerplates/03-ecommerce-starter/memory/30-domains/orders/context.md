# Domínio: Pedidos (Orders)

## Contexto
O módulo de pedidos gerencia o ciclo de vida completo de uma compra, desde criação até entrega. Coordena com pagamentos, inventário e notificações.

## Entidades

### Order
- `id` (UUID): Identificador único (numero de pedido)
- `userId` (FK): Cliente que fez o pedido
- `status` (enum): pending | processing | shipped | delivered | canceled
- `totalAmount` (decimal): Total com imposto
- `subtotal` (decimal): Sem imposto
- `tax` (decimal): Valor do imposto
- `discountAmount` (decimal): Total de descontos aplicados
- `couponId` (FK, nullable): Cupom aplicado
- `shippingAddress` (JSON/text): { street, number, city, state, zip, country }
- `billingAddress` (JSON/text): Idem shippingAddress
- `paymentId` (FK, nullable): Referência ao pagamento
- `createdAt` (timestamp): Data do pedido
- `updatedAt` (timestamp): Última atualização
- `trackingNumber` (string, nullable): Código de rastreamento

### OrderItem
- `id` (UUID)
- `orderId` (FK): Referência ao Order
- `productId` (FK): Produto comprado
- `productName` (string): Nome snapshot (imutável)
- `productPrice` (decimal): Preço na época (imutável)
- `quantity` (int): Quantidade comprada
- `subtotal` (decimal): quantity * productPrice
- `discountAmount` (decimal): Desconto por item
- `createdAt` (timestamp)

## Status Workflow

```
pending → processing → shipped → delivered
         └─ canceled (em qualquer momento)

pending: Pagamento pendente
processing: Pagamento confirmado, preparando envio
shipped: Saiu para entrega
delivered: Entregue ao cliente
canceled: Cancelado por cliente ou admin
```

## API REST

### Listar Pedidos do Usuário
```
GET /api/orders
Authorization: Bearer <user-jwt>
Query params:
  - page: int (default: 1)
  - limit: int (default: 10)
  - status: pending | processing | shipped | delivered | canceled
  - startDate: ISO8601 (filtro por data)
  - endDate: ISO8601

Response (200):
{
  "data": [
    {
      "id": "uuid",
      "createdAt": "2024-01-15T10:30:00Z",
      "status": "shipped",
      "totalAmount": 89.91,
      "items": [
        {
          "productId": "uuid",
          "productName": "Produto X",
          "quantity": 1,
          "subtotal": 89.91
        }
      ],
      "trackingNumber": "BR123456789"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 5 }
}
```

### Detalhes do Pedido
```
GET /api/orders/:orderId
Authorization: Bearer <user-jwt>

Response (200):
{
  "id": "uuid",
  "status": "processing",
  "createdAt": "2024-01-15T10:30:00Z",
  "subtotal": 99.90,
  "tax": 14.99,
  "discountAmount": 10.00,
  "totalAmount": 104.89,
  "coupon": {
    "code": "SUMMER10",
    "discountAmount": 10.00
  },
  "items": [
    {
      "id": "item-uuid",
      "productId": "uuid",
      "productName": "Produto X",
      "productPrice": 99.90,
      "quantity": 1,
      "subtotal": 99.90,
      "canReview": true  // true se status=delivered
    }
  ],
  "shippingAddress": {
    "street": "Rua A",
    "number": "123",
    "city": "São Paulo",
    "state": "SP",
    "zip": "01234-567",
    "country": "BR"
  },
  "payment": {
    "status": "approved",
    "method": "credit_card",
    "transactionId": "txn-uuid"
  },
  "timeline": [
    { "status": "pending", "timestamp": "2024-01-15T10:30:00Z", "message": "Pedido criado" },
    { "status": "processing", "timestamp": "2024-01-15T10:35:00Z", "message": "Pagamento confirmado" }
  ]
}
```

### Criar Pedido (Usado internamente por Checkout)
```
POST /api/orders
Authorization: Bearer <user-jwt>
Body: (gerado automaticamente pelo módulo Checkout)
{
  "cartItems": [...],
  "shippingAddress": {...},
  "couponCode": "SUMMER10"
}

Response (201): Order criado
```

### Atualizar Status do Pedido (Admin)
```
PUT /api/orders/:orderId/status
Authorization: Bearer <admin-jwt>
Body:
{
  "status": "shipped",
  "trackingNumber": "BR123456789"
}

Response (200): Order atualizado
```

### Cancelar Pedido
```
POST /api/orders/:orderId/cancel
Authorization: Bearer <user-jwt>

Validações:
- Status não pode ser "delivered"
- Status não pode ser "canceled"
- Libertar stock se não foi enviado

Response (200): Order com status "canceled"
```

## Regras de Negócio - Pedidos

1. **Criação**: Automática após pagamento bem-sucedido
2. **Status**: Sequencial, não pode voltar
3. **Cancelamento**: Permitido antes de "shipped", com reembolso (future)
4. **Items**: Imutáveis (snapshot de preço/nome)
5. **Total**: subtotal + tax - desconto
6. **Tax**: 15% (simplificado)
7. **Rastreamento**: Adicionado quando status = "shipped"
8. **Timeline**: Histórico imutável de mudanças de status

## Fluxo Típico

1. Usuário completa checkout (veja Payments)
2. Pagamento bem-sucedido → Order criado com status "pending"
3. Admin processa pedido → status "processing"
4. Admin verifica estoque, prepara envio
5. Admin atualiza status → "shipped" com tracking
6. Cliente recebe → status "delivered" (manual ou webhook)
7. Cliente pode avaliar produtos (veja Reviews)

## Performance

- Listar com paginação 10 por padrão
- Índices em (userId, createdAt), (status)
- Detalhes com join otimizado
- Cache de pedidos recentes por 1h

## Validações

| Campo | Regra |
|-------|-------|
| status | enum: pending, processing, shipped, delivered, canceled |
| totalAmount | > 0, 2 casas decimais |
| items | mínimo 1 item |
| shippingAddress | obrigatória, validar CEP (simplificado) |
| billingAddress | obrigatória se não = shippingAddress |
| trackingNumber | opcional, obrigatório se status="shipped" |
