# Contexto: Orders (fatia rica)

> Leia **este arquivo antes do código**. Ele descreve o domínio na linguagem ubíqua. Você só precisa
> descer à implementação quando for *editar* — e aí sabe exatamente onde. Isso é a economia de token
> do boilerplate (ADR-0009): o resumo tipado do domínio, não a leitura da árvore inteira.

## Linguagem ubíqua

- **Order** (agregado) — um pedido de um cliente, com uma ou mais linhas.
- **OrderLine** — produto + preço unitário + quantidade.
- **OrderStatus** — máquina de estados: `DRAFT → CONFIRMED → PAID → SHIPPED`, e `CANCELLED` de
  qualquer estado não-enviado.
- **Money** — value object em centavos; imutável, comparado por valor.

## Invariantes (moram em `domain/order.entity.ts`)

1. Um pedido **precisa de ao menos uma linha** para ser criado.
2. Toda quantidade é **positiva**.
3. O **total é derivado** das linhas — nunca setado de fora.
4. As transições de estado seguem a máquina; em especial: **não se envia sem pagamento** (`SHIPPED`
   só a partir de `PAID`).

Se você vai mexer numa regra, ela está no agregado. Não procure no controller nem no service.

## Casos de uso (contratos em `application/`)

| Use-case | Input → Output | O que faz |
|---|---|---|
| `PlaceOrderUseCase` | `{ customerId, items[] }` → `{ orderId, totalCents }` | cria + confirma o pedido |
| `ShipOrderUseCase` | `{ orderId }` → `void` | envia — falha se não estiver pago |

A assinatura basta para saber o que a feature faz. O corpo só interessa ao editar.

## Onde as coisas ficam

- Regra nova → `domain/order.entity.ts` (e teste em `test/orders/place-order.spec.ts`, sem Nest).
- Caso de uso novo → `application/*.usecase.ts`.
- Persistência → `infrastructure/typeorm-order.repository.ts` (implementa a porta do domínio).
- Endpoint → `presentation/orders.controller.ts` (fino: traduz HTTP ↔ use-case).
