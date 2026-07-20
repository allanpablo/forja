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

## O que a medição diz (e o que ela desmente)

Rode `forja token:economy` — ele mede a **mesma feature** (place + ship, com a invariante "não envia
sem pagamento") nos dois estilos, por cenário. Os números, hoje, para a fatia `orders`:

| Cenário | Clean (camadas) | Flat (uma camada) | Clean vs flat |
|---|---|---|---|
| Entender a feature inteira | ~3684 tok (12 arq.) | ~1298 tok (3 arq.) | **+184%** |
| Mudar a regra de envio (contexto mínimo) | ~1419 tok (3 arq.) | ~910 tok (1 arq.) | **+56%** |

**Para uma feature pequena, o clean-arch custa MAIS tokens — nos dois cenários.** A camada cobra
adiantado, e para duas operações ela não se paga. Se alguém te vendeu "Clean Architecture economiza
tokens" como regra geral, os números acima desmentem — e tudo bem que desmintam.

Então **por que promover `orders` a camadas não é desperdício?** Porque a economia de token não é
função do total de arquivos; é função do **tamanho da feature e do número de casos de uso**. O ganho
aparece quando o service flat cresce: com dez casos de uso, mudar uma regra obriga a ler um service
gordo inteiro (tudo misturado), enquanto no clean o agregado isolado continua pequeno e o `context.md`
aponta direto para ele. O cruzamento existe; para a `orders` de duas operações, ele ainda não chegou.

O que justifica as camadas em `orders` **não é token** — é **isolamento e testabilidade**: a
invariante tem um lar único, testável sem subir o Nest, e sobrevive à troca de ORM. Token é
consequência a partir de certa escala, não a razão. Por isso o critério acima fala de invariante e
máquina de estados, não de contagem de linhas.

O `products/` raso segue certo pelo mesmo motivo invertido: um CRUD não tem invariante para isolar,
então as camadas seriam só custo — de token, medido, e de leitura.

## A regra de ouro

**Comece enxuto. Promova quando a primeira invariante aparecer.** Um `products/` que ganha uma regra
de negócio de verdade (ex.: "não pode desativar produto com pedido aberto") é o sinal de promover
para o padrão de `orders/` — não antes. Arquitetura antecipada é dívida de token paga adiantado.
