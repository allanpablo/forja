# 02 — SaaS Starter multi-tenant

API NestJS 12 (ESM) para um SaaS B2B: **cada organização é um tenant**, com cadastro, login, papéis
e assinatura com faturamento mensal. O ponto de partida já vem com as decisões de segurança que
costumam ficar para depois — e com testes que as cobram.

## O que vem pronto

| Contexto | Faz | Garantias |
|---|---|---|
| `identity` | Cadastro (cria organização + dona), login, refresh, `me`, membros | Senha com scrypt e comparação em tempo constante; access (15 min) e refresh (7 dias) com segredos distintos e `typ` checado; login sem revelar se o e-mail existe |
| `billing` | Planos, assinatura, mudança de plano, fatura do mês | Preço vem da tabela de planos (nunca do cliente), em centavos inteiros; transições de plano validadas no domínio; uma fatura por tenant e período (idempotente) |
| `platform` | Configuração, JWT, papéis | A API não sobe sem `DATABASE_URL`, `JWT_SECRET` e `JWT_REFRESH_SECRET` (nada de segredo padrão); `RolesGuard` por rota |

O **tenant vem sempre do token**, nunca do corpo ou da URL: toda consulta filtra por `tenantId`, e
um recurso de outro tenant responde 404. O `ValidationPipe` rejeita campos fora do DTO (sem
atribuição em massa de `roles`, `tenantId`, `amount`).

## Estrutura

```
backend/src/
  platform/              # config validada, TokenService, JwtAuthGuard, RolesGuard
  identity/
    domain/              # Organization, User, porta IdentityRepository, hash de senha
    application/         # AuthService (casos de uso)
    adapters/http|persistence
  billing/
    domain/              # planos e transições, agregado Subscription, porta BillingRepository
    application/         # BillingService
    adapters/http|persistence
memory/30-domains/       # contexto de cada domínio na linguagem ubíqua (leia antes do código)
```

Mesma regra de dependência do template `clean-arch`: domínio sem Nest nem ORM, adapters implementam
as portas, ligação no módulo.

## Rodando

```bash
forja project:new minha-saas --template saas-starter
cd ~/forja-workspace/projects/minha-saas
docker compose up -d db                 # Postgres de desenvolvimento
cd backend && cp .env.example .env      # preencha JWT_SECRET e JWT_REFRESH_SECRET (openssl rand -base64 48)
npm run start:dev                       # http://localhost:3000/api — Swagger em /api/docs fora de produção
npm test                                # Vitest: domínio e casos de uso, sem Postgres
npm run lint                            # oxlint com checagem de tipos
```

`synchronize` do TypeORM fica ligado só fora de produção. Antes do primeiro deploy, troque por
migrações (`typeorm migration:generate`).

## Rotas

| Método | Rota | Papel |
|---|---|---|
| POST | `/api/auth/signup` · `/api/auth/login` · `/api/auth/refresh` | público |
| GET | `/api/me` · `/api/organization` | autenticado |
| GET | `/api/users` | owner, admin |
| GET | `/api/billing/plans` · `/api/billing/subscription` · `/api/billing/invoices` · `/api/billing/invoices/:id` | autenticado (faturas: owner, admin) |
| PUT | `/api/billing/subscription/plan` | owner |
| POST | `/api/billing/invoices/current` | owner, admin |

## O que fica com você

- **Gateway de pagamento**: a fatura nasce `open`; integrar Stripe/Pagar.me/Asaas é um adapter novo
  que marca `paid` por webhook (verifique a assinatura do webhook).
- **Convites de membros**, recuperação de senha e verificação de e-mail.
- **Revogação de refresh token** (lista de sessões) se precisar de logout em todos os aparelhos.
- **Rate limit** no login (`@nestjs/throttler`).
