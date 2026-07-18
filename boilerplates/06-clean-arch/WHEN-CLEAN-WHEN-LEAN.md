# Quando Clean Architecture, quando enxuto

Este boilerplate tem **os dois padrões lado a lado, de propósito**:

- `modules/orders/` — as quatro camadas (domain / application / infrastructure / presentation).
- `modules/products/` — uma camada só (controller → repositório direto).

Não é inconsistência. É a decisão mais importante da arquitetura, materializada em código: **camadas
custam tokens e arquivos; você paga por elas quando compram algo, e evita quando não.**

## O critério

Use o padrão de `orders/` (camadas + porta + use-case) quando **pelo menos uma** for verdade:

- Há **invariante de negócio** — uma regra que não pode ser violada em estado nenhum ("não envia sem
  pagamento", "saldo não fica negativo"). A regra precisa de um lar único: o domínio.
- Há **máquina de estados** — o objeto tem transições legais e ilegais.
- A regra precisa ser **testada sem subir o framework**, ou sobreviver a troca de infraestrutura.
- Múltiplos casos de uso operam o mesmo conceito de formas diferentes.

Use o padrão de `products/` (uma camada) quando **todas** forem verdade:

- É **CRUD** — criar, ler, atualizar, apagar, sem regra além de validação de formato.
- O "modelo" é a tabela: não há comportamento a proteger.
- Não há transição de estado que importe.

## Por que isso é economia de token, não estética

Um agente que vai adicionar uma regra ao contexto `orders` lê o `context.md` do domínio (linguagem
ubíqua) e a **assinatura** do use-case — e sabe o que fazer sem carregar a implementação inteira. As
camadas dão pontos de entrada previsíveis: a regra vai no agregado, o caso de uso na aplicação, o
mapeamento na infra. Menos exploração, menos tokens.

O mesmo agente, num CRUD, não deveria pagar esse preço de leitura. Por isso `products/` é raso: para
um `GET /products`, quatro camadas seriam quatro arquivos a mais para ler, sem nada a proteger — o
**oposto** de economia de token, com nome de arquitetura.

## A regra de ouro

**Comece enxuto. Promova quando a primeira invariante aparecer.** Um `products/` que ganha uma regra
de negócio de verdade (ex.: "não pode desativar produto com pedido aberto") é o sinal de promover
para o padrão de `orders/` — não antes. Arquitetura antecipada é dívida de token paga adiantado.
