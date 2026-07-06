# 📑 Index

## Memory Structure - Microservices Platform

### 00-global/
Contexto global e políticas transversais
- **mission.md** - Visão, princípios e objetivos
- **patterns.md** - Padrões arquiteturais (DB per service, API Gateway, Service Discovery, Circuit Breaker)
- **context-policy.md** - Headers, error formats, health checks
- **agent-contract.md** - Contrato entre serviços, responsabilidades, SLAs

### 10-product/
Contexto de negócio e produto
- **vision.md** - Visão de produto e roadmap
- **personas.md** - Personas de usuários
- **business-rules.md** - Regras de negócio por domínio
- **nfrs.md** - Non-functional requirements (performance, security, availability)

### 20-architecture/
Arquitetura técnica
- **overview.md** - Visão geral do sistema, diagrama de componentes
- **frontend-architecture.md** - Cliente (web/mobile)
- **backend-architecture.md** - Microserviços, API Gateway, service mesh
- **data-architecture.md** - Databases, caching, message queues
- **security-architecture.md** - Autenticação, autorização, encryption
- **observability-architecture.md** - Logging, tracing, metrics

### 30-domains/
Domínios de negócio isolados

#### 30-domains/auth-service/
- **context.md** - Bounded context de autenticação
- **api.md** - Endpoints, schemas, exemplos

#### 30-domains/user-service/
- **context.md** - Bounded context de gerenciamento de usuários
- **api.md** - Endpoints, schemas, exemplos

#### 30-domains/notification-service/
- **context.md** - Bounded context de notificações
- **api.md** - Endpoints, schemas, exemplos

### 40-delivery/
Plano de entrega
- **roadmap.md** - Fases de desenvolvimento
- **current-sprint.md** - Sprint atual (backlog, tasks)
- **backlog.md** - Product backlog priorizado

### 50-orchestration/
Orquestração de serviços
- **topology.md** - Visão física: ports, DNS, service registry
- **routing.md** - Regras de roteamento no API Gateway
- **handoff-protocol.md** - Protocolo de comunicação inter-service
- **parallel-playbook.md** - Execução paralela de operações
- **handoffs-directory.md** - Diretório de handoffs realizados

### 60-runs/
Logs de execução
- **execution-log.md** - Timeline de deployments e incidents
- **performance-baseline.md** - Benchmarks de performance

### 70-summaries/
Resumos para quick reference
- **global-summary.md** - Overview do sistema completo
- **domain-summaries/** - Resumos por serviço

### 80-data/
Documentação de dados
- **sqlite-schema.md** - Schema do SQLite (se usado localmente)
- **postgresql-schema.md** - Schema dos PostgreSQL de cada serviço
- **message-schema.md** - Schema dos eventos em RabbitMQ

### 90-decisions/
Arquitetura e decisões técnicas
- **adr-template.md** - Template de ADR (Architecture Decision Record)
- **adr-001-microservices.md** - Decisão: por que microserviços?
- **adr-002-nestjs-choice.md** - Decisão: por que NestJS?

---

## Quick Navigation

**Para iniciantes:**
1. Comece em `00-global/mission.md`
2. Entenda os padrões em `00-global/patterns.md`
3. Leia `20-architecture/overview.md`
4. Explore domínios em `30-domains/`

**Para implementação:**
1. Consulte `30-domains/<service>/api.md`
2. Verifique SLAs em `00-global/agent-contract.md`
3. Use `20-architecture/backend-architecture.md` para detalhes técnicos
4. Veja exemplos em `memory/EXEMPLOS-CODIGO.md`

**Para operações:**
1. Topologia: `50-orchestration/topology.md`
2. Roteamento: `50-orchestration/routing.md`
3. Protocolo: `50-orchestration/handoff-protocol.md`
4. Logs: `60-runs/execution-log.md`

**Para decisões técnicas:**
- Consulte `90-decisions/` para entender o "why" de cada decisão
