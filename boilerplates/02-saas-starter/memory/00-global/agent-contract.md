# Contrato de Agentes

## 1. Ciclo de Vida de um Agente

### Setup
```
Agent recebe tarefa → Lê context (30-domains + 20-architecture) 
→ Valida pré-requisitos → Inicia execução
```

**Checklist:**
- [ ] Contexto de domínio lido
- [ ] Dependências resolvidas
- [ ] Ambiente preparado
- [ ] Plano de execução documentado

### Execução
```
Implementa feature → Testa localmente → Registra progresso 
→ Documenta handoff
```

**Invariantes:**
- Nunca quebrar testes existentes
- Sempre atualizar 60-runs/ com status
- Validar tenant isolation em toda operação
- Incluir error handling para todos os paths

### Conclusion
```
Feature completa → Run registrado em 60-runs/ 
→ Summary atualizado em 70-summaries/ → Handoff criado
```

**Deliverables:**
- Código funcional com testes
- Run document completo
- ADR se decisão arquitetural
- Next steps claros

## 2. Responsabilidades por Agente

### Setup Agent
**Entrada**: Nenhuma (configuração inicial)
**Saída**: Environment pronto, schemas criados, seed data

**Checklist:**
- [ ] PostgreSQL rodando (docker-compose)
- [ ] Migrations executadas
- [ ] .env configurado
- [ ] Redis funcional
- [ ] Seed data inserido

**Não faz**: Implementar features, apenas prepare infrastructure

---

### Auth Agent
**Entrada**: Setup Agent completo
**Saída**: Módulo auth com JWT, login, signup

**Responsabilidades:**
- Implementar JWT strategy
- Validar credenciais
- Gerenciar refresh tokens
- Registrar eventos de auth

**Não faz**: Gerenciar roles (vê Users Agent)

---

### Subscriptions Agent
**Entrada**: Auth Agent + Users Agent
**Saída**: Gerenciamento de planos e upgrades

**Responsabilidades:**
- Crud de subscriptions
- Validar transições de plano
- Registrar eventos de negócio
- Integrar com billing

**Não faz**: Processar pagamentos (vê Billing Agent)

---

### Billing Agent
**Entrada**: Subscriptions Agent
**Saída**: Mock payment gateway, invoices

**Responsabilidades:**
- Processar pagamentos (mock Stripe)
- Gerar invoices
- Registrar transações
- Webhook handlers

**Não faz**: Validar planos (vê Subscriptions)

---

### Organizations Agent
**Entrada**: Setup Agent
**Saída**: Multi-tenant structure, org management

**Responsabilidades:**
- CRUD de organizations
- Tenant isolation validation
- Invite members
- Org settings

**Não faz**: Auth (vê Auth Agent), roles (vê Users Agent)

---

### Users Agent
**Entrada**: Auth Agent + Organizations Agent
**Saída**: User management com RBAC

**Responsabilidades:**
- CRUD de users
- Atribuir roles
- Gerenciar permissions
- Audit logging

**Não faz**: Autenticação (vê Auth Agent)

---

### Analytics Agent
**Entrada**: Todos agentes com eventos registrados
**Saída**: Métricas e insights

**Responsabilidades:**
- Agregar eventos
- Calcular churn rate
- MRR tracking
- Dashboard data

**Não faz**: Implementar eventos (cada agente registra seu próprio)

## 3. Contrato de Entrada/Saída

Cada agente declara:

```markdown
## Agent: Subscriptions Agent

### Entrada Obrigatória
- [ ] Auth Agent concluído
- [ ] Users Agent concluído
- [ ] PostgreSQL + Redis rodando
- [ ] Environment: memory/30-domains/subscriptions/context.md

### Saída Entregue
- [ ] POST /api/subscriptions (create)
- [ ] GET /api/subscriptions/:id (read)
- [ ] PUT /api/subscriptions/:id (update plan)
- [ ] Testes E2E passando
- [ ] Run document em 60-runs/

### Erro = Bloqueador
Se alguma entrada não estiver pronta, registrar em:
- memory/40-delivery/backlog.md (como bloqueador)
- Não prosseguir (avoid broken dependencies)
```

## 4. Handoff Protocol

Quando agente completa, cria `50-orchestration/handoffs/{timestamp}-{agent}-{next-agent}.md`:

```markdown
# Handoff: Auth Agent → Subscriptions Agent
**Timestamp**: 2024-01-15 14:30:00
**Status**: ✅ Ready

## O que foi entregue
- ✅ JWT auth funcional
- ✅ Login/signup endpoints
- ✅ User entity com roles
- ✅ All E2E tests passing

## Estado atual do código
- Branch: feature/auth
- Tests: 42 passing, 0 failing
- Coverage: 89%

## Dependências resolvidas
- [ ] JWT config (✅ done)
- [ ] User schema (✅ done)
- [ ] Password hashing (✅ done)

## Próximo agente deve
1. Cherry-pick User entity changes
2. Implementar subscription CRUD
3. Testar isolamento de tenant
4. Criar handoff para Billing Agent

## Issues conhecidas
- None

## Prioridade
🔴 Critical | 🟡 High | 🟢 Medium | ⚪ Low
```

## 5. Error Recovery

**Se agente falha:**
1. Registrar erro em 60-runs/{timestamp}-ERROR.md
2. Rollback de changes (não quebra main)
3. Criação de ADR explicando causa
4. Reatribuir com contexto do erro

**Se dependência não disponível:**
1. Registrar em 40-delivery/backlog.md como bloqueador
2. Não prosseguir (falhar rápido)
3. Notificar responsável da dependência

## 6. Qualidade de Código

Todo agent output deve passar:
- [ ] TypeScript strict mode (no `any`)
- [ ] ESLint + Prettier
- [ ] Unit tests (>80% coverage)
- [ ] E2E tests para happy paths
- [ ] No breaking changes em existing APIs
- [ ] Documentado em memory/

**Violação = Pull request rejection**
