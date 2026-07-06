# Domínio: Inventário (Inventory)

## Contexto
Módulo responsável por gerenciar estoque de produtos em tempo real. Coordena com orders, coupons e product catalog.

## Entidades

### Inventory
- `id` (UUID)
- `productId` (FK, unique): Referência ao produto
- `stock` (int): Quantidade disponível
- `reserved` (int): Quantidade reservada (checkout)
- `reorderPoint` (int): Nível de alerta para reposição
- `reorderQuantity` (int): Qtd sugerida para compra
- `lastRestockDate` (timestamp, nullable): Última reposição
- `updatedAt` (timestamp)

### StockMovement (Log de movimentações)
- `id` (UUID)
- `productId` (FK)
- `movementType` (enum): in | out | reserve | release
- `quantity` (int)
- `orderId` (FK, nullable): Se vem de pedido
- `reason` (string): "checkout", "restock", "adjustment", "cancel"
- `createdAt` (timestamp)

## Fórmulas

```
Available Stock = stock - reserved
Safe Stock = stock (sem reservadas)
Stock to Reorder = reorderQuantity quando stock <= reorderPoint
```

## API REST

### Ver Estoque de Produto
```
GET /api/inventory/:productId

Response (200):
{
  "productId": "uuid",
  "productName": "Produto X",
  "stock": 50,
  "reserved": 5,
  "available": 45,
  "status": "in-stock",  // in-stock | low-stock | out-of-stock
  "reorderPoint": 10,
  "lastRestockDate": "2024-01-10T15:00:00Z"
}
```

### Listar Estoque de Todos os Produtos (Admin)
```
GET /api/inventory
Query params:
  - status: in-stock | low-stock | out-of-stock
  - page: int (default: 1)
  - limit: int (default: 50)

Response (200):
{
  "data": [
    {
      "productId": "uuid",
      "productName": "Produto X",
      "stock": 50,
      "available": 45,
      "status": "in-stock"
    }
  ],
  "pagination": { ... }
}
```

### Reposição de Estoque (Admin)
```
POST /api/inventory/restock
Authorization: Bearer <admin-jwt>
Body:
{
  "productId": "uuid",
  "quantity": 100,
  "notes": "Pedido de reposição #PO-001"
}

Response (201):
{
  "productId": "uuid",
  "stock": 150,
  "movement": {
    "id": "uuid",
    "type": "in",
    "quantity": 100,
    "reason": "restock",
    "createdAt": "2024-01-15T12:00:00Z"
  }
}
```

### Atualizar Estoque Manual (Admin)
```
PUT /api/inventory/:productId
Authorization: Bearer <admin-jwt>
Body:
{
  "stock": 120,
  "reason": "adjustment"  // ou: "damage", "theft", "recount"
}

Response (200): Inventory atualizado
```

### Histórico de Movimentações (Admin)
```
GET /api/inventory/:productId/movements
Query params:
  - type: in | out | reserve | release
  - startDate: ISO8601
  - endDate: ISO8601
  - page: 1, limit: 50

Response (200):
{
  "data": [
    {
      "id": "uuid",
      "type": "out",
      "quantity": 2,
      "reason": "checkout",
      "orderId": "uuid",
      "createdAt": "2024-01-15T10:35:00Z"
    }
  ]
}
```

## Regras de Negócio - Inventário

### 1. **Reserva de Stock (Checkout)**
```
Quando checkout inicia:
  1. Validar available >= qty_total
  2. Se OK: UPDATE inventory SET reserved = reserved + qty_total
  3. Se falha: Retornar erro, não reservar nada
```

### 2. **Liberação de Stock (Sucesso de Pagamento)**
```
Quando pagamento é aprovado:
  1. UPDATE inventory SET stock = stock - quantidade, reserved = reserved - quantidade
  2. Criar movimento: type="out", reason="checkout", orderId=xxx
```

### 3. **Cancelamento (Pagamento Recusado)**
```
Quando pagamento falha:
  1. UPDATE inventory SET reserved = reserved - quantidade
  2. Não alterar stock (volta a estar disponível)
  3. Criar movimento: type="release", reason="payment-failed"
```

### 4. **Cancelamento de Pedido**
```
Quando usuário cancela pedido (antes de enviado):
  1. Se ainda não foi enviado: liberar stock
  2. UPDATE inventory SET stock = stock + quantidade
  3. Criar movimento: type="in", reason="cancel"
```

### 5. **Alertas**
- Se stock < reorderPoint → flagar para reposição
- Alert enviado ao admin (future: email)

### 6. **Reestoque**
- Entrada manual, cria movimento "in" com reason="restock"

## Fluxo Típico

```
1. Produto criado → Inventory criado com stock=0
2. Admin faz reposição → stock=100, movement logged
3. Cliente busca produto → stock=100, available=100
4. Cliente add ao carrinho → (sem mudança de inventory)
5. Cliente checkout → 
   - Validar available >= qty
   - Se OK: reserved += qty
   - Se falha: erro
6. Pagamento processado →
   - Se sucesso: stock -= qty, reserved -= qty, movimento "out"
   - Se falha: reserved -= qty, movimento "release"
7. Carrinho limpo
8. Order criado com items

Stock sempre >= 0 (validação de banco de dados)
```

## Performance

- Índices em (productId), (stock, reserved)
- Queries de movimento com paginação
- Cache de estoque por 5min (invalidado em update)
- Transação atomic para checkout

## Validações

| Campo | Regra |
|-------|-------|
| productId | deve existir e ter inventory |
| stock | >= 0, não pode ser negativo |
| reserved | >= 0, <= stock |
| reorderPoint | >= 0 |
| reorderQuantity | > 0 |
| quantity (restock) | > 0 |

## Dashboard de Reposição (Future)

```
GET /api/inventory/reorder-list (Admin)
Response:
{
  "products_to_reorder": [
    {
      "productId": "uuid",
      "productName": "Produto X",
      "stock": 8,
      "reorderPoint": 10,
      "suggestedQty": 100
    }
  ]
}
```
