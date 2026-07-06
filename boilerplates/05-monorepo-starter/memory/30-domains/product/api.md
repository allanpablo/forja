# Product API Endpoints

## Public Endpoints

### List Products
```
GET /api/products?page=1&limit=20
Optional: ?search=term&category=cat

Response: 200 OK
{
  "success": true,
  "data": {
    "products": [...ProductResponse[]],
    "total": 150,
    "page": 1,
    "limit": 20
  }
}
```

### Get Product Details
```
GET /api/products/:id

Response: 200 OK
{
  "success": true,
  "data": { ...ProductResponse }
}
```

## Admin-Only Endpoints

### Create Product
```
POST /api/products
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "sku": "PROD-001",
  "name": "Widget",
  "description": "A useful widget",
  "price": 29.99,
  "stockQuantity": 100
}

Response: 201 Created
{
  "success": true,
  "data": { ...ProductResponse }
}
```

### Update Product
```
PUT /api/products/:id
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "Updated Widget",
  "price": 34.99,
  "stockQuantity": 95
}

Response: 200 OK
{
  "success": true,
  "data": { ...ProductResponse }
}
```

### Delete Product
```
DELETE /api/products/:id
Authorization: Bearer <admin_token>

Response: 204 No Content
```
