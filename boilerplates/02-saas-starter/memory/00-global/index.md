# Índice de Memória - SaaS Starter

## Navegação Rápida

### 00-Global (Políticas & Princípios)
- **[mission.md](./mission.md)** — Visão, objetivos, papéis de agentes
- **[patterns.md](./patterns.md)** — Code patterns, conventions, testing
- **[context-policy.md](./context-policy.md)** — Gestão de níveis, freshness, limpeza
- **[agent-contract.md](./agent-contract.md)** — Ciclo de vida, responsabilidades, handoffs
- **[index.md](./index.md)** — Este arquivo

### 10-Product (Visão & Regras)
- **vision.md** — Proposta de valor, diferencial
- **personas.md** — Buyer persona, user scenarios
- **business-rules.md** — Rules engine, compliance
- **nfrs.md** — Performance, scalability, security requirements

### 20-Architecture (Decisões Técnicas)
- **overview.md** — Diagrama de arquitetura, stack
- **frontend.md** — Stack frontend, componentes, state
- **backend.md** — NestJS, modules, database strategy
- **data.md** — PostgreSQL schema, indexing strategy
- **security.md** — JWT, RBAC, encryption, PII
- **observability.md** — Logging, metrics, tracing

### 30-Domains (Domínios de Negócio)
- **auth/context.md** — O que é auth aqui, fluxo
- **auth/api.md** — Endpoints, contratos, errors
- **subscriptions/context.md** — Planos, transições, regras
- **subscriptions/api.md** — Endpoints de subscriptions
- **billing/context.md** — Pagamentos, invoices, refunds
- **billing/api.md** — Endpoints de billing

### 40-Delivery (Roadmap & Sprints)
- **roadmap.md** — 6+ months vision
- **sprint-atual.md** — Sprint atual, tasks, burndown
- **backlog.md** — Product backlog, priorização

### 50-Orchestration (Topologia de Agents)
- **topology.md** — Quais agents, quando, em que ordem
- **routing.md** — Como agentes se descobrem
- **handoff-protocol.md** — Formato, timing, escalation
- **playbook-paralelo.md** — Como executar 2+ agents em paralelo
- **handoffs/ directory** — Histórico de handoffs

### 60-Runs (Logs de Execução)
- **index.md** — Lista de todas as runs
- **YYYY-MM-DD-agent-task.md** — Run log individual
- **YYYY-MM-DD-ERROR.md** — Logs de erro

### 70-Summaries (Sínteses Executivas)
- **global.md** — Status geral, funcionalidades implementadas, bloqueadores
- **auth.md** — Status módulo auth, endpoints ready
- **subscriptions.md** — Status subscriptions, issues
- **billing.md** — Status billing, payment gateway

### 80-Data (Schemas & Migrations)
- **schema.md** — Entidades PostgreSQL, relationships
- **migrations/ directory** — Histórico de migrations
- **seeds/ directory** — Seed data

### 90-Decisions (ADRs - Architecture Decision Records)
- **adr-template.md** — Template para novas decisões
- **adr-YYYYMMDD-*.md** — Decisões arquiteturais
- **index.md** — Índice de ADRs
- **conflicts.md** — Conflitos e resoluções

## Fluxo de Leitura por Cenário

### Cenário 1: Novo agente começa tarefa
1. Ler level 30 (domain específico)
2. Ler level 20 (architecture)
3. Ler level 00 (patterns)
4. Verificar 40-delivery para status
5. Executar tarefa
6. Documentar em 60-runs

### Cenário 2: Debug de issue
1. Procurar em 60-runs (problema similar?)
2. Verificar ADR em 90-decisions (decisão relevante?)
3. Consultar domain context em 30-domains
4. Criar ADR se nova decisão necessária

### Cenário 3: Atualizar visão de produto
1. Editar 10-product/
2. Criar ADR em 90-decisions
3. Registrar em 70-summaries/global.md

### Cenário 4: Escalação de bloqueador
1. Documentar issue em 60-runs/ERROR.md
2. Registrar dependência em 40-delivery/backlog.md
3. Criar ADR se decisão necessária
4. Notificar responsável

## Queries Rápidas

**"Qual é o status do auth module?"**
→ Ler `70-summaries/auth.md`

**"Como implementar novo endpoint?"**
→ Ler `00-global/patterns.md` + `20-architecture/backend.md`

**"Qual é o próximo agente?"**
→ Ler `40-delivery/sprint-atual.md` + `50-orchestration/topology.md`

**"Por que escolhemos PostgreSQL?"**
→ Buscar ADR em `90-decisions/`

**"O que significa tenant isolation?"**
→ Ler `20-architecture/security.md` + `30-domains/auth/context.md`

**"Como fazer handoff?"**
→ Ler `50-orchestration/handoff-protocol.md` (template em `agent-contract.md`)

## Atualização Frequência

| Nível | Frequência | Responsável |
|-------|-----------|-------------|
| 00 | Trimestral | Tech lead |
| 10 | Mensal | Product |
| 20 | Conforme necessário | Tech lead |
| 30 | Cada agente concluindo | Agentes |
| 40 | Semanal | Scrum master |
| 50 | Cada handoff | Agente completando |
| 60 | Cada execução | Agente executando |
| 70 | Diário | Summary agent |
| 80 | Com migrations | Data agent |
| 90 | Decisões imutáveis | Tech lead |

## Last Updated
- **Date**: 2024-01-15
- **By**: SaaS Starter Scaffold
- **Next Review**: 2024-02-15
