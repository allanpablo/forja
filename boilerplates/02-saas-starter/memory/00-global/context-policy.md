# Política de Contexto & Gestão de Memória

## 1. Estrutura de Níveis

A memória está organizada em 10 níveis que crescem em especificidade:

| Nível | Escopo | Uso |
|-------|--------|-----|
| 00 | Global | Mission, patterns, policies |
| 10 | Product | Visão, personas, regras |
| 20 | Architecture | Decisões técnicas |
| 30 | Domains | Context por domínio de negócio |
| 40 | Delivery | Roadmap, sprints |
| 50 | Orchestration | Topologia de agents |
| 60 | Runs | Logs de execução |
| 70 | Summaries | Sínteses executivas |
| 80 | Data | Schemas, migrations |
| 90 | Decisions | ADRs (Architecture Decision Records) |

## 2. Fluxo de Leitura de Context

**Ordem de prioridade** para agente decidir ação:
1. Domínio específico (30-domains/X/)
2. Architecture decisão (20-architecture/)
3. Padrões globais (00-global/patterns.md)
4. Regras de produto (10-product/business-rules.md)

**Exemplo**: Para implementar "upgrade de subscription":
1. Ler `30-domains/subscriptions/context.md` (o que é upgrade aqui)
2. Ler `30-domains/billing/context.md` (impacto no billing)
3. Ler `20-architecture/backend.md` (padrão de implementação)
4. Aplicar padrão de service/controller de `patterns.md`

## 3. Gestão de Estado em Runs

Cada execução de agente registra:

```
60-runs/
  ├── 2024-01-15-auth-setup.md
  ├── 2024-01-15-subscription-endpoint.md
  └── index.md (lista de todas as runs)
```

**Formato de run:**
```markdown
# Auth Setup - 2024-01-15 10:30:00

## Agente
Setup Agent

## Tarefa
Inicializar módulo de autenticação

## Output
- ✅ JWT config criado
- ✅ Local strategy implementada
- ✅ Login endpoint funcional

## Issues
- Nenhum

## Próximos passos
- Implementar refresh token
```

## 4. Atualização de Summaries

**Global summary** (`70-summaries/global.md`):
- Atualizado diariamente
- Lista funcionalidades implementadas
- Identifica bloqueadores

**Domain summaries** (`70-summaries/{domain}.md`):
- Atualizado quando módulo completa feature
- Estado de cada endpoint
- Issues conhecidas

## 5. Versionamento de Memória

Quando política muda:
1. Criar ADR em `90-decisions/adr-YYYYMMDD-{titulo}.md`
2. Atualizar arquivo afetado com timestamp
3. Registrar em `90-decisions/index.md`

**Exemplo de ADR:**
```
# ADR-20240115-001: JWT expiry strategy

## Context
Tokens devem expirar, mas user experience deve ser suave

## Decision
- Access token: 15 minutos
- Refresh token: 7 dias
- Silent refresh em background

## Consequences
- Melhor segurança, mais chamadas à API
- Melhor UX com refresh automático
```

## 6. Quem Atualiza Cada Seção

| Seção | Quem |
|-------|-----|
| 00-global | Tech lead, architect |
| 10-product | Product manager, PO |
| 20-architecture | Tech lead |
| 30-domains | Agentes de domínio |
| 40-delivery | Scrum master, tech lead |
| 50-orchestration | Tech lead, setup agent |
| 60-runs | Cada agente após execução |
| 70-summaries | Summary agent (rotina diária) |
| 80-data | Data agent, migrations |
| 90-decisions | Tech lead, architect |

## 7. Context Freshness

**Staleness rules:**
- Padrões (00-global): OK até 3 meses sem atualização
- Domain context (30-domains): AVISO se > 1 sprint
- Runs (60-runs): OBRIGATÓRIO após cada execução
- Summaries: AVISO se > 1 dia
- Decisions: Nunca ficam obsoletos (imutáveis)

## 8. Limpeza de Contexto

Trimestral:
1. Arquivar runs antigas (60-runs → 60-runs/archive/)
2. Consolidar learnings em 70-summaries
3. Atualizar ADRs obsoletos
4. Verificar alinhamento de 10-product com 30-domains

## 9. Conflitos de Contexto

Se dois documentos dizem coisas diferentes:
1. Ordem de precedência: Decisão > Domain > Architecture > Pattern
2. ADR mais recente vence
3. Registrar conflito em `90-decisions/conflicts.md`
4. Resolver em pair programming ou architecture review
