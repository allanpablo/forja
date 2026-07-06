# Contrato de Agentes (Agent Contract)

## Princípios
1. **Responsabilidade Única**: Cada agente tem um domínio/skill claro
2. **Comunicação Explícita**: Via memory/, handoffs com timestamp
3. **Falha Graceful**: Sempre reportar status, não falhar silenciosamente
4. **Rastreabilidade**: Toda ação registrada em 60-runs/

## Agentes Definidos

### Orchestrator (orquestrador)
- **Responsabilidade**: Coordenação, routing, handoffs
- **Entrada**: Requisições de novos features, bugs
- **Saída**: Handoff estruturado em 50-orchestration/handoffs/
- **SLA**: Responde em < 5min

### Backend-NestJS
- **Responsabilidade**: API REST, domain logic, persistência
- **Input**: Requisições do Orchestrator
- **Output**: Código em `backend/src/`, testes, migrations
- **Constraints**: TypeScript strict, testes obrigatórios

### Frontend (future)
- **Responsabilidade**: UI/UX, integração com backend
- **Input**: API contracts do backend
- **Output**: React/Vue components, stories

### DBA (future)
- **Responsabilidade**: Schemas, migrations, performance
- **Input**: Entidades do backend
- **Output**: Migrations, índices, queries otimizadas

### Security
- **Responsabilidade**: Validação, autenticação, compliance
- **Input**: Code review, arquitetura
- **Output**: Recomendações, fixes

## Handoff Format
```
memory/50-orchestration/handoffs/[ISO8601-slug].md
---
From: Orchestrator
To: Backend-NestJS
Status: pending | in-progress | completed
Task: [Breve descrição]
Context: [Link para memory/]
Artifacts: [Arquivos gerados]
```

## Escalação
- Bug crítico → Backend-NestJS direct
- Decisão arquitetural → Security + Backend-NestJS (ADR em 90-decisions)
- Feature complexa → Orchestrator → decomposição em subtasks
