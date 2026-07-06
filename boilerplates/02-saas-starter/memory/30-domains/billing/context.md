# Billing Domain Context

## O que é Billing neste SaaS?

Billing cuida de:
1. Processar pagamentos (mock Stripe para MVP)
2. Gerar invoices
3. Registrar transações
4. Retry policy para falhas
5. Webhooks para eventos de billing

## Fluxo de Pagamento

```
Usuário faz upgrade
    ↓
Billing Agent recebe request
    ↓
Validar payment method (card)
    ↓
Chamar payment gateway (mock Stripe)
    ↓
[Sucesso?]
  SIM →  Criar invoice, registrar transação
         Enviar email de receipt
         Webhook callback
  NÃO →  Retry logic (3 tentativas em 14 dias)
         Notificar usuário
         Tentar method alternativo
```

## Payment Gateway Mock

Para MVP, simulamos Stripe com:
- Status: "succeeded" (90%) ou "failed" (10%)
- Transações em banco de dados
- Invoice generation automática

```typescript
// Mock Stripe response
{
  "id": "pi_1234567890",
  "amount": 9900,
  "currency": "usd",
  "status": "succeeded",
  "payment_method": {
    "type": "card",
    "card": { "last4": "4242", "brand": "visa" }
  },
  "created": 1705330200
}
```

## Invoice Structure

```json
{
  "id": "inv_xyz",
  "organizationId": "org-uuid",
  "invoiceNumber": "INV-2024-001",
  "amount": 99.00,
  "currency": "usd",
  "status": "paid",
  "description": "Pro Plan - January 2024",
  "items": [
    {
      "description": "Pro Plan",
      "quantity": 1,
      "unitPrice": 99.00,
      "amount": 99.00
    },
    {
      "description": "Additional User (4 seats)",
      "quantity": 4,
      "unitPrice": 10.00,
      "amount": 40.00
    }
  ],
  "issuedAt": "2024-01-01T00:00:00Z",
  "dueDate": "2024-01-15T00:00:00Z",
  "paidAt": "2024-01-01T10:30:00Z"
}
```

## Regras de Negócio

1. **Retry Policy**:
   - 1ª tentativa: Imediato
   - 2ª tentativa: 3 dias depois
   - 3ª tentativa: 10 dias depois
   - Após 3 falhas: Suspender acc, enviar notificação

2. **Invoice Generation**:
   - Automático após pagamento bem-sucedido
   - Inclui subscription + add-ons (extra seats)
   - PDF gerado async (futura)

3. **Refund Policy**:
   - Dentro de 14 dias: Full refund
   - Após 14 dias: Pro-rata refund
   - Processado em 5-7 dias

4. **Tax Calculation** (Futura):
   - US: Sales tax por estado
   - EU: VAT aplicado
   - B2B: Reverse charge

5. **Currency Handling**:
   - MVP: USD apenas
   - Futuro: Multi-currency com taxa de câmbio

## Métricas Importantes

- **Failed payment rate**: % de pagamentos rejeitados
- **Churn via failed payment**: % de cancelamentos por payment failure
- **Refund rate**: % de refunds vs total transactions
- **Invoice delivery**: % enviados < 1 min

## Status Atual

- ✅ Invoice entity
- ✅ Payment mock (Stripe-like)
- ✅ Transaction history
- ✅ Invoice generation
- 🚧 PDF generation
- 🚧 Real Stripe integration
- 🚧 Webhook handling
- 🚧 Tax calculation
- 🚧 Multi-currency

## Próximos Steps

1. Implementar real Stripe integration
2. Adicionar webhook handlers
3. Gerar PDFs de invoices
4. Implementar tax calculation
5. Adicionar refund endpoints
