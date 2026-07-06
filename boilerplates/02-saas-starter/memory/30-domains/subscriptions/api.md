# Subscriptions API Specification

## Endpoints

### 1. Get Subscription

**GET** `/api/subscriptions`

Headers: `Authorization: Bearer {token}`

**Response 200**:
```json
{
  "data": {
    "id": "sub-uuid",
    "organizationId": "org-uuid",
    "plan": "pro",
    "status": "active",
    "currentPeriodStart": "2024-01-01T00:00:00Z",
    "currentPeriodEnd": "2024-02-01T00:00:00Z",
    "cancellationScheduledAt": null,
    "createdAt": "2024-01-01T10:00:00Z"
  }
}
```

---

### 2. Create Subscription

**POST** `/api/subscriptions`

Headers: `Authorization: Bearer {token}`, Content-Type: `application/json`

```json
{
  "plan": "pro"
}
```

**Response 201**:
```json
{
  "data": {
    "id": "sub-uuid",
    "plan": "pro",
    "status": "active",
    "currentPeriodStart": "2024-01-01T00:00:00Z",
    "currentPeriodEnd": "2024-02-01T00:00:00Z"
  }
}
```

---

### 3. Upgrade/Downgrade Plan

**POST** `/api/subscriptions/:id/upgrade`

```json
{
  "newPlan": "enterprise"
}
```

**Response 200**:
```json
{
  "data": {
    "id": "sub-uuid",
    "plan": "enterprise",
    "status": "active",
    "upgradedAt": "2024-01-15T14:30:00Z",
    "prorateCharge": 45.67
  }
}
```

**Error 400**: Transição de plano inválida

---

### 4. Cancel Subscription

**POST** `/api/subscriptions/:id/cancel`

```json
{
  "reason": "Too expensive",
  "immediate": false
}
```

**Response 200**:
```json
{
  "data": {
    "id": "sub-uuid",
    "status": "scheduled_for_cancellation",
    "cancellationScheduledAt": "2024-02-01T00:00:00Z"
  }
}
```

---

### 5. Get Usage Metrics

**GET** `/api/subscriptions/usage`

**Response 200**:
```json
{
  "data": {
    "subscriptionId": "sub-uuid",
    "plan": "pro",
    "apiCallsThisMonth": 45234,
    "apiCallsLimit": 100000,
    "storageUsed": 24.5,
    "storageLimitGB": 100,
    "seatsUsed": 3,
    "seatsIncluded": 5,
    "percentageUtilization": 45.2
  }
}
```

---

## Error Codes

| Code | Message | Meaning |
|------|---------|---------|
| SUB_001 | Invalid plan transition | Downgrade mid-year ou outro erro |
| SUB_002 | Subscription not found | Org não tem subscription |
| SUB_003 | Plan not found | Plano não existe |
| SUB_004 | Approval required | Upgrade para Enterprise precisa aprovação |
| SUB_005 | Quota exceeded | Hard limit atingido |

## Flow Examples

### Scenario: Get Current Subscription
```bash
curl -X GET http://localhost:3000/api/subscriptions \
  -H "Authorization: Bearer eyJhbGc..."
```

### Scenario: Upgrade to Pro
```bash
curl -X POST http://localhost:3000/api/subscriptions/{id}/upgrade \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{ "newPlan": "pro" }'
```

### Scenario: Check Usage
```bash
curl -X GET http://localhost:3000/api/subscriptions/usage \
  -H "Authorization: Bearer eyJhbGc..."
```

### Scenario: Cancel Subscription
```bash
curl -X POST http://localhost:3000/api/subscriptions/{id}/cancel \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Too expensive", "immediate": false }'
```

## Implementation Notes

- Todas operações isoladas por tenant
- Upgrade cobra pro-rata via Billing Agent
- Usage tracking é informativo (soft limits)
- Downgrade efetiva no fim do ciclo
- Cancellation pode ser imediata ou agendada
