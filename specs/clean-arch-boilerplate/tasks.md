# Tasks: clean-arch-boilerplate

- **Spec**: ./spec.md
- **Plan**: ./plan.md
- **Status**: approved
- **Criado em**: 2026-07-18

> Decomposição executável. O boilerplate é **conteúdo de template** (código do projeto gerado), não
> código do framework — não roda na CI do Forja. Escrever para ser referência idiomática correta.

---

## T1 — Esqueleto + `shared/`
- **Owner**: Worker · **Estimativa**: P · **Depende de**: —
- **Paths**: `boilerplates/06-clean-arch/backend/src/{shared,main.ts,app.module.ts}`
- **Done**: `Result`/erros de domínio/base VO; `main.ts`/`app.module.ts`; `package.json` + `tsconfig`
  do projeto (com `test:e2e`, `start:dev` etc. — entram na allowlist derivada do SPEC-011).

## T2 — Fatia rica: Orders (as 4 camadas) — AC-1/2/3/5
- **Owner**: Worker · **Estimativa**: M · **Depende de**: T1
- **Paths**: `.../modules/orders/{domain,application,infrastructure,presentation}/*`, `orders.module.ts`
- **Done**:
  - [ ] `domain/`: `Order` (agregado, invariantes: não confirma sem estoque, não envia sem pagamento),
        `order-status.vo.ts`, `order.repository.ts` (porta = interface + token). **Zero `@nestjs`/ORM.**
  - [ ] `application/`: `place-order`/`ship-order` use-cases com input/output tipados (contrato legível).
  - [ ] `infrastructure/`: adapter TypeORM implementa a porta + mapper domínio↔orm-entity.
  - [ ] `presentation/`: controller + HTTP DTOs mapeando p/ use-case.
  - [ ] `orders.module.ts`: bind `{ provide: ORDER_REPOSITORY, useClass: TypeOrmOrderRepository }`.

## T3 — Teste da invariante sem Nest — AC-8
- **Owner**: Worker · **Estimativa**: P · **Depende de**: T2
- **Paths**: `.../backend/test/orders/place-order.spec.ts`
- **Done**: testa a invariante de domínio **instanciando só o agregado** (sem `Test.createTestingModule`,
  sem ORM). É a prova concreta do isolamento — se precisar do Nest, o domínio vazou.

## T4 — Caminho enxuto: Products (1 camada) — AC-4
- **Owner**: Worker · **Estimativa**: P · **Depende de**: T1
- **Paths**: `.../modules/products/*`, `WHEN-CLEAN-WHEN-LEAN.md`
- **Done**: CRUD controller→repo direto, **sem** use-case/porta; o doc ensina o critério de escolha.
  Kill criteria: se Products virar 4 camadas, a spec falhou.

## T5 — Memória por contexto (o vetor de token) — AC-6
- **Owner**: Worker · **Estimativa**: P · **Depende de**: T2, T4
- **Paths**: `.../memory/30-domains/{orders,products}/context.md`
- **Done**: cada contexto descrito na linguagem ubíqua — o que o agente lê **antes** do código.
  Orders documenta as invariantes e os use-cases; Products, o CRUD raso.

## T6 — Manifesto + catálogo + README — AC-7
- **Owner**: Worker · **Estimativa**: P · **Depende de**: T1-T5
- **Paths**: `.../boilerplate.manifest.json`, `.../README.md`, `boilerplates/README.md`
- **Done**: manifesto no schema 1.0 (stack/useCases/commands); entrada no catálogo; README explicando
  a estrutura e apontando o `WHEN-CLEAN-WHEN-LEAN.md`.

## T7 — Medir o token (métrica-norte) + ADR-0027 — AC-6/AC-10
- **Owner**: SDD Architect + Governance · **Estimativa**: P · **Depende de**: T5, T6
- **Paths**: `memory/90-decisions/0027-*.md`
- **Done**:
  - [ ] Medir o pacote de contexto de "adicionar uma regra ao contexto orders" aqui vs. no
        `02-saas-starter` flat. **Registrar os números.**
  - [ ] ADR-0027: Clean Architecture calibrada; o porquê da calibração e o resultado da medição.
        Se o token não caiu, o ADR diz isso e recalibra — não maquia.

## T8 — Gates (Governance) — AC-9
- **Owner**: Governance · **Estimativa**: P · **Depende de**: T6
- **Done**: `release:check` (boilerplate no `files[]`, instala limpo), `tools:doctor` (docs-commands
  não acusa fantasma), `npm test` do Forja verde. spec → `done`.

---
## Handoffs
Worker (T1-T6), SDD Architect + Governance (T7-T8). `forja agent:route` a cada fronteira (ADR-0005).
