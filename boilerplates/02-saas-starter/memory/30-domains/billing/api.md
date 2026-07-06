# Billing API Specification

## Endpoints

### 1. Process Payment

**POST** `/api/billing/charge`

Headers: `Authorization: Bearer {token}`, Content-Type: `application/json`

```json
{
  "amount": 99.00,
  "currency": "usd",
  "description": "Pro Plan Upgrade",
  "paymentMethodId": "pm_1234567890"
}
```

**Response 200**:
```json
{
  "data": {
    "paymentIntentId": "pi_1234567890",
    "status": "succeeded",
    "amount": 99.00,
    "currency": "usd",
    "invoiceId": "inv_xyz",
    "invoiceNumber": "INV-2024-001",
    "receipt": "https://..."
  }
}
```

**Error 402**: Payment failed
**Error 400**: Invalid payment method

---

### 2. Get Invoices

**GET** `/api/billing/invoices`

Headers: `Authorization: Bearer {token}`

**Query params**:
- `status`: "paid", "pending", "failed" (optional)
- `limit`: 50 (default)
- `offset`: 0 (default)

**Response 200**:
```json
{
  "data": [
    {
      "id": "inv_xyz",
      "invoiceNumber": "INV-2024-001",
      "amount": 99.00,
      "status": "paid",
      "issuedAt": "2024-01-01T00:00:00Z",
      "paidAt": "2024-01-01T10:30:00Z",
      "receipt": "https://..."
    }
  ],
  "pagination": {
    "total": 12,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 3. Get Invoice Details

**GET** `/api/billing/invoices/:id`

**Response 200**:
```json
{
  "data": {
    "id": "inv_xyz",
    "invoiceNumber": "INV-2024-001",
    "organizationId": "org-uuid",
    "amount": 99.00,
    "currency": "usd",
    "status": "paid",
    "items": [
      {
        "description": "Pro Plan",
        "quantity": 1,
        "unitPrice": 99.00,
        "amount": 99.00
      }
    ],
    "issuedAt": "2024-01-01T00:00:00Z",
    "dueDate": "2024-01-15T00:00:00Z",
    "paidAt": "2024-01-01T10:30:00Z"
  }
}
```

---

### 4. Get Invoice PDF

**GET** `/api/billing/invoices/:id/pdf`

**Response 200**: PDF file (application/pdf)

---

### 5. Create Refund

**POST** `/api/billing/invoices/:id/refund`

```json
{
  "reason": "duplicate_charge",
  "amount": 99.00
}
```

**Response 201**:
```json
{
  "data": {
    "refundId": "ref_123",
    "originalInvoiceId": "inv_xyz",
    "amount": 99.00,
    "status": "processing",
    "estimatedDate": "2024-01-08T00:00:00Z"
  }
}
```

---

### 6. Get Payment Methods

**GET** `/api/billing/payment-methods`

**Response 200**:
```json
{
  "data": [
    {
      "id": "pm_1234567890",
      "type": "card",
      "card": {
        "brand": "visa",
        "last4": "4242",
        "expMonth": 12,
        "expYear": 2025
      },
      "default": true
    }
  ]
}
```

---

### 7. Add Payment Method

**POST** `/api/billing/payment-methods`

```json
{
  "paymentMethodId": "pm_token_from_stripe"
}
```

**Response 201**:
```json
{
  "data": {
    "id": "pm_1234567890",
    "type": "card",
    "default": false
  }
}
```

---

### 8. Get Transactions

**GET** `/api/billing/transactions`

**Response 200**:
```json
{
  "data": [
    {
      "id": "txn_123",
      "amount": 99.00,
      "type": "charge",
      "status": "succeeded",
      "relatedInvoiceId": "inv_xyz",
      "createdAt": "2024-01-01T10:30:00Z"
    }
  ]
}
```

---

## Error Codes

| Code | Message | Meaning |
|------|---------|---------|
| BIL_001 | Payment failed | Card declined, insufficient funds |
| BIL_002 | Invalid payment method | Payment method not found ou expirado |
| BIL_003 | Invoice not found | Invoice não existe |
| BIL_004 | Refund failed | Não pode fazer refund (expired, etc) |
| BIL_005 | Insufficient permissions | Apenas owner/admin pode gerenciar billing |

## Flow Examples

### Scenario: Charge for Upgrade
```bash
curl -X POST http://localhost:3000/api/billing/charge \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 99.00,
    "currency": "usd",
    "description": "Pro Plan Upgrade",
    "paymentMethodId": "pm_1234567890"
  }'
```

### Scenario: List Invoices
```bash
curl -X GET http://localhost:3000/api/billing/invoices \
  -H "Authorization: Bearer eyJhbGc..."
```

### Scenario: Get Invoice PDF
```bash
curl -X GET http://localhost:3000/api/billing/invoices/inv_xyz/pdf \
  -H "Authorization: Bearer eyJhbGc..." \
  -o invoice.pdf
```

### Scenario: Request Refund
```bash
curl -X POST http://localhost:3000/api/billing/invoices/inv_xyz/refund \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{ "reason": "duplicate_charge", "amount": 99.00 }'
```

## Implementation Notes

- Todas operações isoladas por tenant
- Payment gateway é mock para MVP (90% success, 10% fail)
- Invoices geradas automaticamente após sucesso
- Refund processa em background (async)
- Retry logic para pagamentos falhados: 3 tentativas em 14 dias
