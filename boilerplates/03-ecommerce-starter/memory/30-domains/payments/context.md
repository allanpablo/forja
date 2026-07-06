# Domínio: Pagamentos (Payments)

## Contexto
Módulo responsável por processar pagamentos usando um mock de Stripe. Para MVP, implementa lógica básica de autorização (90% sucesso, 10% falha aleatório).

## Entidades

### Payment
- `id` (UUID): Identificador único (transactionId)
- `orderId` (FK): Pedido associado
- `amount` (decimal): Valor a processar
- `currency` (string, default: "BRL"): Moeda
- `status` (enum): pending | approved | declined | refunded
- `method` (string): credit_card | debit_card | pix (mock)
- `cardLast4` (string, nullable): Últimos 4 dígitos do cartão
- `stripeTransactionId` (string, unique): ID externo (mock)
- `errorMessage` (text, nullable): Razão da recusa
- `fees` (decimal): Taxa de processamento (2.9% + R$0.30)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

## API REST

### Processar Pagamento
```
POST /api/payments/process
Authorization: Bearer <user-jwt>
Body:
{
  "orderId": "uuid",
  "amount": 104.89,
  "method": "credit_card",
  "card": {
    "number": "4111111111111111",  (mock, não validado realmente)
    "expiry": "12/25",
    "cvc": "123"
  }
}

Response (201) - Sucesso (90%):
{
  "status": "approved",
  "transactionId": "stripe-mock-uuid",
  "message": "Pagamento aprovado",
  "orderId": "uuid"
}

Response (402) - Falha (10%):
{
  "status": "declined",
  "transactionId": "stripe-mock-uuid",
  "message": "Cartão recusado - Contate seu banco",
  "errorCode": "card_declined"
}
```

### Detalhes do Pagamento
```
GET /api/payments/:transactionId
Authorization: Bearer <user-jwt>

Response (200):
{
  "id": "uuid",
  "transactionId": "stripe-mock-uuid",
  "orderId": "uuid",
  "amount": 104.89,
  "status": "approved",
  "method": "credit_card",
  "cardLast4": "1111",
  "fees": 3.34,  // 2.9% + 0.30
  "createdAt": "2024-01-15T10:35:00Z"
}
```

### Reembolso (Future)
```
POST /api/payments/:transactionId/refund
Authorization: Bearer <admin-jwt>
Body:
{
  "reason": "Solicitado pelo cliente"
}

Response (200):
{
  "status": "refunded",
  "refundId": "uuid",
  "amount": 104.89,
  "createdAt": "2024-01-15T11:00:00Z"
}
```

## Regras de Negócio - Pagamentos

### Lógica de Simulação
1. Gerar número aleatório 0-100
2. Se >= 90: Payment status = "approved"
3. Se < 90: Payment status = "declined" (erro aleatório)

### Cálculo de Taxas
- Taxa Stripe mock: 2.9% do amount + R$ 0.30
- Exemplo: R$ 100 → taxa = (100 * 0.029) + 0.30 = R$ 3.20

### Fluxo de Aprovação
1. Validar dados do cartão (mock)
2. Chamar "Stripe API" (lógica aleatória)
3. Se aprovado:
   - Salvar Payment com status "approved"
   - Atualizar Order status → "processing"
   - Liberar estoque de reserva
4. Se recusado:
   - Salvar Payment com status "declined"
   - Manter Order status → "pending"
   - Liberar stock (volta a disponível)
   - Retornar erro

### Dados Sensíveis
- Número do cartão NÃO é armazenado (segurança)
- Apenas last4 para referência
- CVC nunca é armazenado

### Idempotência
- Mesmo orderId só pode ter 1 Payment "approved"
- Retentativas com mesmo orderId retornam resultado anterior

## Fluxo Típico

1. Usuário completa carrinho + cupom
2. Usuário insere dados de envio
3. Usuário insere dados de cartão
4. Sistema valida carrinho (estoque, cupom)
5. Sistema cria Order (status: pending)
6. Sistema processa pagamento (POST /api/payments/process)
7. Se sucesso (90%):
   - Payment status = "approved"
   - Order status = "processing"
   - Carrinho = limpo
   - Response: { status: 'approved', orderId: 'uuid' }
8. Se falha (10%):
   - Payment status = "declined"
   - Order status = "pending"
   - Stock = liberado
   - Response: { status: 'declined', message: '...' }

## Performance

- Processamento < 500ms (simulado)
- Idempotência em Redis por 1h
- Logs estruturados com traceId

## Validações

| Campo | Regra |
|-------|-------|
| amount | > 0, 2 casas decimais |
| method | enum: credit_card, debit_card, pix |
| card.number | Mock aceita qualquer 16 dígitos |
| card.expiry | Formato MM/YY, não expirado |
| card.cvc | 3-4 dígitos |

## Segurança

- Sem validação real de cartão (mock)
- Números não são armazenados
- HTTPS obrigatório em produção
- Rate limiting: 5 tentativas/min por ordem
- Logs sem dados sensíveis
