# Billing — contexto

Cada organização tem uma **assinatura** de um **plano** (`free`, `pro`, `enterprise`). O período
de cobrança é o mês civil em UTC. Uma **fatura** cobra um período de uma assinatura.

## Regras

- Preços e limites estão em `src/billing/domain/plan.ts`, em centavos inteiros. O valor da fatura
  vem dali, nunca do cliente.
- Transições: `free → pro | enterprise`, `pro → free | enterprise`; `enterprise` é contratual
  (mudanças fora da API). Transição proibida responde 422 e não altera nada.
- Mudar o plano é só da `owner`.
- Uma fatura por organização e período: emitir de novo devolve a mesma (índice único no banco).
  Valor zero nasce `paid`; o resto nasce `open` até o gateway confirmar.
- Fatura de outra organização responde 404 (não 403: não confirma que existe).

## Onde está

`src/billing/domain/` (planos, agregado `Subscription`, portas) ·
`application/billing.service.ts` · `adapters/persistence/` (TypeORM).
