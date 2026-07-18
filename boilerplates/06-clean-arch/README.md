# 06 — Clean Architecture Calibrada

Boilerplate NestJS + TypeScript com **DDD e Clean Architecture onde se paga, e caminho enxuto onde
não** — a calibração é o ponto, não as camadas.

## A ideia em uma frase

Camadas custam arquivos e tokens; você paga por elas quando protegem uma regra de negócio, e evita
quando é CRUD. Este boilerplate mostra **os dois padrões lado a lado** para você ver o critério, não
decorar dogma. Leia o [`WHEN-CLEAN-WHEN-LEAN.md`](WHEN-CLEAN-WHEN-LEAN.md) — é o coração.

## Estrutura

```
backend/src/
  modules/orders/        # FATIA RICA — 4 camadas, porque há invariante de negócio
    domain/              #   agregado + value objects + PORTA (interface). Puro: zero @nestjs/ORM
    application/         #   use-cases (contratos tipados, legíveis sem a implementação)
    infrastructure/      #   adapter TypeORM (implementa a porta) + mapper domínio↔persistência
    presentation/        #   controller fino + DTOs HTTP
  modules/products/      # CAMINHO ENXUTO — 1 camada, porque é CRUD sem regra
  shared/                # Result, base de domínio
backend/test/            # a invariante testada SEM subir o Nest
memory/30-domains/       # o contexto de cada domínio na linguagem ubíqua (leia antes do código)
```

## A regra de dependência

Tudo aponta para **dentro**: `presentation` e `infrastructure` → `application` → `domain`. O domínio
não importa nada de fora. A infra **implementa** portas que o domínio declara. A inversão acontece no
módulo, numa linha: `{ provide: ORDER_REPOSITORY, useClass: TypeOrmOrderRepository }`.

## Economia de token (ADR-0009)

O agente lê `memory/30-domains/<ctx>/context.md` e a **assinatura** do use-case — e sabe o que a
feature faz sem carregar a implementação. As camadas dão pontos de entrada previsíveis (regra no
agregado, orquestração no use-case, persistência na infra). Arquitetura como compressão de contexto.

## Rodando

```bash
npm install
npm run start:dev            # sobe o Nest (precisa de DATABASE_URL Postgres)
npm test                     # roda os testes de domínio — sem Postgres, sem Nest
```

O `npm test` prova a premissa: a invariante do domínio (`test/orders/place-order.spec.ts`) roda
instanciando só o agregado. Se um teste de regra precisar do framework, o domínio vazou.
