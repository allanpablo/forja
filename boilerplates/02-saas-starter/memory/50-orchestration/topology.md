# Topologia de Agentes

## Sequência de Execução

```
Setup Agent (0 deps)
  ↓
  ├→ Auth Agent
  │   ↓
  │   ├→ Subscriptions Agent
  │   │   ↓
  │   │   └→ Billing Agent
  │   │
  │   └→ Users Agent (RBAC)
  │
  ├→ Organizations Agent (Multi-tenant)
  │
  └→ Analytics Agent (não-blocking, last)
```

## Agentes & Timeline

| # | Agent | Deps | Duration | Output |
|---|-------|------|----------|--------|
| 1 | Setup | - | 2h | ENV + DB ready |
| 2 | Auth | Setup | 4h | JWT auth working |
| 3 | Organizations | Setup | 2h | Multi-tenant isolation |
| 4 | Users | Auth + Orgs | 3h | RBAC matrix |
| 5 | Subscriptions | Auth + Users | 3h | Plans + CRUD |
| 6 | Billing | Subscriptions | 3h | Mock Stripe |
| 7 | Analytics | All (optional) | 2h | Event tracking |

**Total sequential**: 19 hours  
**With parallelization**: 11 hours (Auth + Orgs parallel, then rest)

## Parallelização Possível

### Wave 1 (Start)
- Setup Agent (blocking, must complete first)

### Wave 2 (After Setup)
- Auth Agent (parallel)
- Organizations Agent (parallel)

### Wave 3 (After Wave 2)
- Users Agent (depends on Auth + Orgs)
- Subscriptions Agent (depends on Auth)

### Wave 4 (After Wave 3)
- Billing Agent (depends on Subscriptions)

### Wave 5 (Optional)
- Analytics Agent (optional, non-blocking)

## Decisões & Handoffs

Cada agente cria handoff document (`memory/50-orchestration/handoffs/`) após completar:

```
handoffs/
  ├── 2024-01-15-setup-auth.md        (Setup → Auth)
  ├── 2024-01-15-auth-subscriptions.md (Auth → Subscriptions)
  ├── 2024-01-15-subscriptions-billing.md (Subscriptions → Billing)
  └── ...
```

## Critérios de Sucesso

Agente completa quando:
1. ✅ Todos endpoints implementados
2. ✅ Testes E2E passando
3. ✅ Zero breaking changes
4. ✅ Documentação atualizada (memory/30-domains/)
5. ✅ Run log criado (memory/60-runs/)
6. ✅ Handoff document criado

## Escalation Path

Se agente falha:
1. Registrar em memory/60-runs/{date}-ERROR.md
2. Criar issue no backlog como bloqueador
3. Revisar com tech lead
4. Retry com contexto de erro (ADR)
5. Se persiste: manual investigation

## Monitoring

- Agentes com timeout: >4 horas sem handoff
- Quality gate: Coverage <60% ou testes falhando
- Performance: E2E tests >30s = investigate
