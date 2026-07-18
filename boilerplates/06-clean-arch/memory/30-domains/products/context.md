# Contexto: Products (caminho enxuto)

> CRUD sem regra de negócio. **Uma camada.** Se você esperava as quatro camadas de `orders/`, leia o
> `WHEN-CLEAN-WHEN-LEAN.md` — a ausência delas aqui é decisão, não esquecimento.

## Linguagem ubíqua

- **Product** — nome + preço (centavos). Não há comportamento a proteger; o modelo é a tabela.

## Regras

Nenhuma além de validação de formato (nome string, preço inteiro positivo). Não há invariante, não
há transição de estado. Por isso o `controller` fala direto com o repositório do TypeORM.

## Quando isto vira `orders/`

No dia em que aparecer uma regra de verdade — por exemplo, *"não pode desativar um produto com pedido
em aberto"* — este contexto ganha um agregado de domínio e migra para o padrão de quatro camadas. Até
lá, promover seria pagar tokens adiantado por camadas vazias.

## Onde as coisas ficam

- Tudo em `modules/products/`: `product.entity.ts` (o modelo) e `products.controller.ts` (o CRUD).
