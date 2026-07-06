# Missão do Projeto SaaS Starter

## Visão Geral

Fornecer uma plataforma SaaS multi-tenant, escalável e pronta para produção que:

1. **Autenticação & Autorização**: JWT-based com RBAC (roles: owner, admin, member)
2. **Subscription Management**: Planos (free, pro, enterprise) com gerenciamento automático
3. **Billing & Payments**: Integração mock com sistemas de pagamento (Stripe-like)
4. **Multi-Tenancy**: Isolamento seguro de dados por organização
5. **Observabilidade**: Logs estruturados e métricas para decisões operacionais

## Princípios Fundamentais

| Princípio | Descrição |
|-----------|-----------|
| **Multi-Tenant First** | Cada organização é isolada em camada de data e contexto |
| **Security by Default** | JWT + Rate limiting + Input validation em todas as rotas |
| **Scalability Ready** | Arquitetura preparada para PostgreSQL + Redis |
| **Developer Experience** | NestJS + TypeScript com tipagem forte e injeção de dependências |
| **Testabilidade** | Testes E2E para fluxos críticos (auth, subscriptions, billing) |

## Objetivos Imediatos

1. Gerar scaffold completo com módulos SaaS funcionais
2. Fornecer exemplos de endpoints para Auth, Subscriptions e Billing
3. Documentar fluxos de signup, subscription upgrade, e pagamento
4. Incluir testes E2E para os fluxos críticos
5. Docker-compose com PostgreSQL + Redis preconfigurado

## Papéis de Agentes

| Agente | Responsabilidade |
|--------|-----------------|
| **Setup Agent** | Inicializar projeto, criar schemas, seedar dados |
| **Auth Agent** | Validar JWT, gerenciar permissões RBAC |
| **Subscription Agent** | Gerenciar planos e upgrades |
| **Billing Agent** | Processar pagamentos (mock) e gerar invoices |
| **Analytics Agent** | Rastrear eventos de negócio e métricas |

## Status

- ✅ Estrutura de memória criada
- ✅ Backend NestJS inicializado
- 🚀 Pronto para integração de agents
