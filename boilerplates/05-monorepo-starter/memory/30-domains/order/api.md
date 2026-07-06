# Order API Endpoints

## Protected Endpoints (Requires JWT)

### Create Order
```
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    { "productId": "uuid1", "quantity": 2 },
    { "productId": "uuid2", "quantity": 1 }
  ],
  "shippingAddress": "123 Main St, City, State 12345"
}

Response: 201 Created
{
  "success": true,
  "data": { ...OrderResponse }
}
```

### Get Order Details
```
GET /api/orders/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": { ...OrderResponse }
}
```

### List User's Orders
```
GET /api/orders?page=1&limit=10
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "orders": [...OrderResponse[]],
    "total": 5,
    "page": 1
  }
}
```

### Update Order Status (Admin)
```
PATCH /api/orders/:id/status
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "status": "shipped"
}

Response: 200 OK
{
  "success": true,
  "data": { ...OrderResponse }
}
```

### Cancel Order
```
DELETE /api/orders/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "message": "Order cancelled"
}
```
