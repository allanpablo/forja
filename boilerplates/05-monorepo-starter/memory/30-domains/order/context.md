# Order Domain

## Domain Models
- **Order Entity** — Represents a customer purchase
  - Fields: id, userId, status, totalAmount
  - Constraints: totalAmount > 0, status in enum
- **OrderItem Entity** — Line items in order
  - Fields: id, orderId, productId, quantity, unitPrice

## API Contracts (shared-types)

### OrderItemRequest
```typescript
{
  productId: string;
  quantity: number;
}
```

### CreateOrderRequest
```typescript
{
  items: OrderItemRequest[];
  shippingAddress: string;
}
```

### OrderResponse
```typescript
{
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
  totalAmount: number;
  items: OrderItemResponse[];
  createdAt: Date;
  updatedAt: Date;
}
```

### OrderItemResponse
```typescript
{
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
}
```

## Business Logic
- Orders can only be created by authenticated users
- Each item quantity must be available in stock
- Order status starts as 'pending'
- Status transitions: pending → processing → shipped → delivered
- Refunds allowed within 30 days

## Error Codes
- `PRODUCT_OUT_OF_STOCK` — Insufficient inventory
- `ORDER_NOT_FOUND` — Order doesn't exist
- `INVALID_ORDER_STATUS` — Can't transition to that status
- `UNAUTHORIZED_ORDER_ACCESS` — Not order owner
