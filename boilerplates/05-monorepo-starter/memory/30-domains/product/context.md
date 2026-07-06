# Product Domain

## Domain Models
- **Product Entity** — Represents a product in catalog
  - Fields: id, sku, name, description, price, stockQuantity
  - Constraints: sku unique, price > 0

## API Contracts (shared-types)

### CreateProductRequest (Admin)
```typescript
{
  sku: string;
  name: string;
  description: string;
  price: number;
  stockQuantity: number;
}
```

### ProductResponse
```typescript
{
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  stockQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### UpdateProductRequest (Admin)
```typescript
{
  name?: string;
  description?: string;
  price?: number;
  stockQuantity?: number;
}
```

## Business Logic
- Products can only be created by admins
- SKU must be globally unique
- Price and stock are always >= 0
- Products are soft-deleted (not removed from DB)
- Stock decreases when order is created

## Error Codes
- `PRODUCT_NOT_FOUND` — Product doesn't exist
- `SKU_ALREADY_EXISTS` — SKU taken
- `INSUFFICIENT_STOCK` — Not enough inventory
- `INVALID_PRICE` — Price must be positive
