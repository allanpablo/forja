# Subscriptions Domain Context

## O que é Subscription neste SaaS?

Um subscription representa um plano escolhido por uma organização, com:
1. Escolha de plano (free, pro, enterprise)
2. Tracking de limite de uso (API calls, storage)
3. Upgrade/downgrade com proration
4. Eventos de billing vinculados

## Planos

### Free
- **Price**: $0/mês
- **API calls**: 1.000/mês
- **Storage**: 1GB
- **Users**: 1
- **Support**: Community

### Pro
- **Price**: $99/mês (ou $1.188/ano = 20% off)
- **API calls**: 100.000/mês
- **Storage**: 100GB
- **Users**: 5 (+ $10/user adicional)
- **Support**: Email 24h

### Enterprise
- **Price**: Custom
- **API calls**: Unlimited
- **Storage**: Unlimited
- **Users**: Unlimited
- **Support**: Dedicated account manager

## Fluxo de Upgrade

```
Usuário em Free
    ↓ (seleciona Pro)
Validar transição possível?
    ↓ SIM
Chamar Billing Agent (cobrar cartão)
    ↓ (sucesso)
Atualizar subscription.plan = 'pro'
Registrar audit log
    ↓
Enviar email confirmação
```

## Regras de Negócio

1. **Transições válidas**:
   - Free → Pro: Imediato, charged pro-rata
   - Free → Enterprise: Requires approval
   - Pro → Free: Imediato, credit note gerado
   - Pro → Enterprise: Requer aprovação

2. **Pro-rata charging**:
   ```
   Days remaining in month = 30 - current_day
   Daily rate = Plan price / 30
   Pro-rata charge = daily_rate * days_remaining
   ```

3. **Effective dates**:
   - Upgrade: Imediato
   - Downgrade: Fim do ciclo de billing

4. **Quotas & Limits**:
   - Free: 1k API calls (soft limit, aviso)
   - Pro: 100k API calls (soft limit, aviso)
   - Hard limits triggerem bloqueio e sugestão de upgrade

5. **Annual subscriptions**:
   - 20% desconto (Pro = $1.188/ano)
   - Renova em anniversary date
   - Cannot downgrade mid-year

## Métricas Importantes

- **MRR** (Monthly Recurring Revenue): Soma de subscriptions ativas × preço
- **ARR** (Annual Recurring Revenue): MRR × 12
- **Churn rate**: (Orgs canceladas / Orgs ativas) × 100
- **Net Retention**: (MRR fim mês - (Downgrade + Churn) + Upgrades) / MRR início
- **ARPU** (Average Revenue Per User): MRR / Total users

## Status Atual

- ✅ Subscription entity criada
- ✅ CRUD endpoints
- ✅ Plan validation
- ✅ Upgrade logic
- 🚧 Annual subscriptions (future)
- 🚧 Bulk seats billing (future)

## Próximos Steps

1. Implementar annual subscriptions
2. Adicionar feature flags por plano
3. Criar dashboard de uso (consumo de API calls)
4. Webhooks para mudanças de subscription
