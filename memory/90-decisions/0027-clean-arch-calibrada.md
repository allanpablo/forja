# ADR-0027: Boilerplate Clean Architecture calibrada

- **Status**: accepted
- **Data**: 2026-07-18
- **Autor(es)**: Allan Pablo
- **Tags**: boilerplate, ddd, clean-architecture, token-economy

## Contexto

Os boilerplates do Forja eram NestJS-flat: o `service` fala direto com a entity do ORM, a regra de
negócio fica diluída no service acoplada ao framework. Dois preços — manutenção (testar regra exige
subir o Nest; trocar ORM é cirurgia) e **tokens** (ADR-0009): um agente precisa ler a implementação
inteira para entender uma feature, porque não há contrato legível separado da execução.

A resposta ingênua — "aplicar Clean Architecture" — tem o preço oposto: quatro camadas para um CRUD
são mais arquivos para ler, não menos. Cargo-cult de arquitetura é o anti-padrão de token com nome
bonito.

## Decisão

Um boilerplate (`boilerplates/06-clean-arch`) que demonstra **os dois padrões lado a lado**:

- **Fatia rica (Orders)**: 4 camadas (domain / application / infrastructure / presentation) com
  inversão de dependência. Invariantes de negócio (não envia sem pagamento; total derivado; máquina
  de estados) vivem no domínio, em TypeScript puro — **zero `@nestjs`, zero ORM**. Testáveis sem
  subir o Nest.
- **Caminho enxuto (Products)**: CRUD numa camada, controller→repo direto, sem use-case nem porta.
- **`WHEN-CLEAN-WHEN-LEAN.md`**: o critério de qual padrão usar. É o coração — a calibração é a
  decisão, não as camadas.
- **Memória por bounded context** (`memory/30-domains/<ctx>/context.md`): a linguagem ubíqua que o
  agente lê antes do código.

Inversão via DI do Nest: a porta é `interface` no domínio + token; o adapter a implementa; o módulo
faz o bind numa linha. O domínio e a aplicação não sabem que TypeORM existe.

## A medição de token — honesta (o que a spec exigiu)

A SPEC-013 fez da economia de token a métrica-norte e mandou **reconhecer se não cair, não maquiar**.
Então:

Medida crua (bytes/4) do custo de "ler o domínio para editar uma regra":

| | tokens aprox. |
|---|---|
| Clean-arch: `context.md` (476) + `order.entity.ts` (690) | **~1167** |
| Flat 02-saas: `billing.service.ts` (486) + `invoice.entity.ts` (244) | **~730** |

**Na contagem crua, Clean-arch não ganha — é maior.** E a comparação é injusta: o domínio de Orders
tem máquina de estados e invariantes reais; o service de billing é fino. Estamos comparando lógica
rica com lógica pobre, não arquitetura com arquitetura.

**Onde o benefício de token realmente está** (e o que a medida crua não captura):

1. **Localização.** Para editar uma regra em Clean-arch, o agente lê o `context.md` (que aponta
   "a regra está em `order.entity.ts`") e o agregado — e **não carrega** infraestrutura, controller
   nem use-cases. No flat, a regra está no service misturada a acesso a dados; para ter certeza de
   achar toda a lógica, o agente varre mais.
2. **O `context.md` como mapa.** 476 tokens lidos primeiro que substituem exploração. No flat não há
   mapa: o agente greps/lê para descobrir onde a regra vive.
3. **Ler assinatura, não implementação.** Para *entender* (não editar), o `context.md` + a assinatura
   do use-case bastam; no flat, lê-se o service.

**Conclusão honesta**: o ganho é **navegacional** (não recarregar código não-relacionado + o mapa),
não de tamanho de arquivo. A medida crua feita aqui é um proxy fraco e **não prova** a economia. A
prova rigorosa precisa do benchmark sobre uma **mesma tarefa**, com a mesma feature nas duas
arquiteturas — o boilerplate flat não tinha um equivalente rico ao Order, então ficou como follow-up.

### Follow-up resolvido — o benchmark same-feature (`forja token:economy`)

A dívida acima foi fechada: existe um `benchmarks/clean-vs-flat/orders-flat/` (a MESMA feature —
place + ship + "não envia sem pagamento" — no estilo flat) e o comando `token:economy` mede **dois
eixos**, porque a economia de token do Forja tem dois eixos e eles são diferentes:

**Eixo 1 — arquitetura (clean vs flat).** Desmente a versão ingênua da claim:

| Cenário | Clean | Flat | Clean vs flat |
|---|---|---|---|
| Entender a feature inteira | ~3684 tok (12 arq.) | ~1298 tok (3 arq.) | **+184%** |
| Mudar a regra de envio (contexto mínimo) | ~1419 tok (3 arq.) | ~910 tok (1 arq.) | **+56%** |

Para uma feature pequena, **o clean-arch custa MAIS tokens** — inclusive na mudança localizada. A
camada cobra adiantado e, com dois casos de uso, não se paga. **A justificativa de `orders` em
camadas passa a ser isolamento e testabilidade, não token.**

**Eixo 2 — memória (frio vs quente).** É aqui que a economia real do framework mora (ADR-0009):

| Cenário | Quente (com `context.md`) | Frio (sem mapa) | Economia |
|---|---|---|---|
| Localizar e mexer numa regra da fatia | ~1419 tok (3 arq.) | ~3684 tok (12 arq.) | **−61%** |

O `context.md` é o mapa: com ele, o agente vai direto ao agregado + à máquina de estados; sem ele,
varre a fatia inteira para descobrir onde a regra vive. **E essa economia COMPÕE**: gerar do zero é
custo único (o scaffold), mas o mapa poupa a cada tarefa futura, pela vida do projeto. O
`token:economy` não mede o custo de gerar — mede o regime permanente, depois do projeto levantado.

Conclusão corrigida: a economia de token do Forja **não é das camadas — é da memória persistente**,
amortizada no tempo. As camadas se pagam só a partir de certa escala (tamanho da feature × nº de
casos de uso); a memória se paga desde a segunda tarefa. Tudo reproduzível: `forja token:economy`.

## Alternativas consideradas

- **Clean Architecture em tudo** — rejeitada: é o cargo-cult que a calibração existe para evitar. O
  `WHEN-CLEAN-WHEN-LEAN.md` + o Products enxuto são o guardrail.
- **Clean Architecture no framework Forja** — rejeitada (fora do escopo da SPEC-013): over-engineering
  para um CLI. O framework ganha só modelos de domínio tipados, ride na migração TS (SPEC-012).
- **Refatorar os boilerplates 01-05** — rejeitada: aditivo, não migração. Os flat servem o CRUD.

## Consequências

**Positivas**:
- Um esqueleto onde a regra de negócio é isolada, testável sem framework, e sobrevive a troca de ORM.
- A calibração é **visível em código** (Orders rico vs. Products enxuto), não só documentada.
- O guardrail contra token-bloat é explícito e reprovável (o Products *tem* que ser 1 camada).

**Negativas / Trade-offs**:
- A economia de token **não está provada** — está argumentada (navegacional) e medida cruamente com
  resultado inconclusivo. O benchmark real é follow-up. Registrar isto é a honestidade que a spec
  cobrou; claim de vitória não-medida seria maquiar.
- Mais conceitos para o dev absorver na fatia rica. Mitigado: uma fatia rica só; o resto enxuto.

## Rastreamento

- Implementação: `boilerplates/06-clean-arch/`
- Spec: `specs/clean-arch-boilerplate/` (SPEC-013)
- ADRs relacionadas: ADR-0009 (economia de tokens — a métrica-norte), ADR-0001 (memória por contexto),
  ADR-0016 (harness), SPEC-012 (TS — o domínio tipado)
- **Follow-up**: benchmark `context:smart` de uma tarefa-tipo, mesma feature nas duas arquiteturas.
