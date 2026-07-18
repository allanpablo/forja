# Plan: clean-arch-boilerplate

- **Spec**: ./spec.md
- **Status**: approved
- **Criado em**: 2026-07-18

> Como vamos construir o que a spec define. Sem código aqui — só estrutura e decisões.

## 1. Abordagem técnica

Um boilerplate NestJS + TypeScript com a **regra de dependência para dentro** (Clean Architecture /
Hexagonal). A fatia rica é **Order** (invariante: não confirma sem estoque, não envia sem
pagamento) — vive no domínio, testável sem Nest. O contraponto enxuto é **Product** (CRUD),
demonstrando o caminho de 1 camada. O `WHEN-CLEAN-WHEN-LEAN.md` é o coração da spec: ensina o
critério, não a ceremônia.

O mecanismo de inversão no Nest: a **porta é uma `interface` no domínio + um token de injeção**; o
adapter (repo ORM) a implementa; o módulo faz o bind `{ provide: ORDER_REPO, useClass: TypeOrmOrderRepo }`.
O use-case injeta a porta, nunca o adapter. É o padrão documentado uma vez e repetido.

## 2. Estrutura de diretórios (o contrato visual)

```
boilerplates/06-clean-arch/
  backend/src/
    modules/orders/            # FATIA RICA — as 4 camadas
      domain/
        order.entity.ts        # agregado: invariantes vivem aqui (pure TS, zero Nest/ORM)
        order-status.vo.ts     # value object (máquina de estados)
        order.repository.ts     # PORTA (interface) + token ORDER_REPOSITORY
      application/
        place-order.usecase.ts # input/output tipados; orquestra domínio + porta
        ship-order.usecase.ts
        dtos.ts                # contratos de aplicação (não HTTP)
      infrastructure/
        typeorm-order.repository.ts  # ADAPTER: implementa a porta
        order.orm-entity.ts    # entity do ORM (mapper domínio↔persistência)
      presentation/
        orders.controller.ts   # HTTP DTOs + mapeia p/ use-case
        orders.http.dto.ts
      orders.module.ts         # bind porta→adapter (inversão)
    modules/products/          # CAMINHO ENXUTO — CRUD, 1 camada
      products.controller.ts   # controller → repo direto; sem use-case/porta
      product.entity.ts
      products.module.ts
    shared/                    # Result/Either, base VO, erros de domínio
    main.ts · app.module.ts
  backend/test/
    orders/place-order.spec.ts # testa a INVARIANTE sem subir o Nest (AC-8)
  memory/30-domains/orders/context.md   # linguagem ubíqua — o agente lê ISTO antes do código
  memory/30-domains/products/context.md
  WHEN-CLEAN-WHEN-LEAN.md      # o critério de calibração
  boilerplate.manifest.json · README.md
```

O `orders/` e o `products/` lado a lado **são** a spec: um mostra Clean Architecture onde se paga, o
outro mostra o custo evitado. O dev/agente vê os dois e entende o critério pela estrutura.

## 3. Fluxo de dependência (a regra)

```
  presentation ─┐
                ├─► application ─► domain ◄─ (ports: interfaces)
  infrastructure┘                    ▲
       (adapters implementam ports) ─┘
  dependências apontam p/ DENTRO. domain não importa nada de fora.
```

## 4. Contratos (o que se lê sem a implementação)

```ts
// domain/order.repository.ts — a PORTA
export const ORDER_REPOSITORY = Symbol('OrderRepository');
export interface OrderRepository {
  save(order: Order): Promise<void>;
  byId(id: OrderId): Promise<Order | null>;
}

// application/place-order.usecase.ts — o contrato legível (AC-5)
export interface PlaceOrderInput  { customerId: string; items: OrderLine[]; }
export interface PlaceOrderOutput { orderId: string; total: Money; }
// a assinatura basta para o agente saber o que a feature faz — sem ler o corpo
```

## 5. Decisões e alternativas

**D1: Order como fatia rica.** Invariante cross-aggregate universal e reconhecível ("não envia sem
pagamento"). Alternativa (Subscription/máquina de estados) é boa mas menos imediata; fica como VO
dentro de Order (`order-status.vo.ts`), aproveitando os dois.

**D2: Product como caminho enxuto — lado a lado, não escondido.** A calibração precisa ser *visível*.
Um CRUD que atravessa controller→repo direto, sem use-case nem porta, no mesmo boilerplate. É o AC-4
materializado em código, não só no doc.

**D3: Porta = interface no domínio + token Nest.** O domínio define o contrato; o Nest só faz o bind.
Alternativa rejeitada: repositório abstrato como classe base (acopla o domínio ao mecanismo de
herança e, na prática, ao Nest). Interface + token mantém o domínio puro.

**D4: Domínio puro, zero `@nestjs` e zero ORM.** É o que torna o teste-sem-Nest (AC-8) possível e é a
prova concreta do isolamento. O ORM vive só em `infrastructure/`, com mapper explícito
domínio↔orm-entity. Sem `@Entity` decorando o agregado de domínio.

**D5: Memória por contexto é o vetor de token (AC-6).** `context.md` descreve o domínio na linguagem
ubíqua. O agente lê ele + a assinatura do use-case; só desce ao código quando vai *editar*. É onde a
economia de token se materializa — e onde a mediremos.

**D6: Aditivo, sem tocar 01-05.** Novo diretório, novo manifesto. Os geradores existentes não mudam;
só o catálogo de boilerplates ganha uma entrada.

D1–D5 são estruturais → **ADR-0027** (Clean Architecture calibrada; o porquê da calibração e do token).

## 6. Dependências

- **Specs**: SPEC-012 (TS) — o domínio é tipado; alinhado, não bloqueante.
- **Pacotes** (do projeto *gerado*, não do Forja): `@nestjs/*`, `typeorm`, `jest`. Ficam no
  `package.json` do boilerplate — e por isso entram na allowlist derivada do `docs-commands` (SPEC-011).
- **Migrações**: nenhuma no framework.

## 7. Rollout

- [ ] Esqueleto + `shared/` (Result, erros de domínio, base VO) primeiro.
- [ ] Fatia rica Orders (domain → application → infra → presentation), com o teste-sem-Nest a cada camada.
- [ ] Caminho enxuto Products.
- [ ] Memória por contexto + `WHEN-CLEAN-WHEN-LEAN.md`.
- [ ] Manifesto + entrada no catálogo + `boilerplates/README.md`.
- [ ] **Medir (AC-6/métrica-norte)**: `context:smart` para "adicionar regra ao contexto orders" aqui
      vs. no `02-saas-starter` flat. Registrar os números no ADR. Se não cair, recalibra antes de fechar.
- [ ] Gates: `release:check` (boilerplate no `files[]`, instala limpo), `tools:doctor` (coerência de doc).

## 8. Sinais de fracasso (kill criteria)

- **O caminho enxuto não existe de verdade** — se no fim tudo virou 4 camadas, a spec falhou (o
  cargo-cult que ela existe para evitar). Products tem que ser genuinamente 1 camada.
- **O token não cai** (AC-6). Se o pacote de contexto não encolher vs. o flat, a arquitetura virou
  custo. Reconhecer e recalibrar, não maquiar.
- **O domínio importa `@nestjs` ou ORM.** Qualquer import de framework no `domain/` quebra a premissa
  inteira; o teste-sem-Nest é o detector.
