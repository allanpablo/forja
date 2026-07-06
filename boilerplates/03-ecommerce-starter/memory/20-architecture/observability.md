# Observabilidade - Arquitetura

## 1. Logging Estruturado

### Log Format (JSON)

```json
{
  "timestamp": "2024-01-15T10:35:30.123Z",
  "level": "info|warn|error|debug",
  "context": "ProductsController|ProductsService",
  "message": "GET /api/products",
  "method": "GET",
  "path": "/api/products",
  "statusCode": 200,
  "duration": "45ms",
  "userId": "user-uuid",
  "requestId": "trace-id-uuid",
  "query": { "page": 1, "limit": 20 },
  "error": null
}
```

### Níveis de Log

- **DEBUG** - Informações para troubleshooting (desabilitado em prod)
- **INFO** - Operações normais do sistema
- **WARN** - Situações anormais (cupom inválido, stock baixo)
- **ERROR** - Erros (pagamento recusado, DB offline)

### Exemplo de Implementação

```typescript
// logger.service.ts
@Injectable()
export class LoggerService {
  log(message: string, context?: string, data?: any) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      context,
      message,
      ...data,
    }));
  }

  error(message: string, error?: Error, context?: string) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      context,
      message,
      errorMessage: error?.message,
      stack: error?.stack,
    }));
  }
}
```

## 2. Health Checks

### Endpoint de Health

```
GET /api/health
Response: {
  "status": "up|down",
  "timestamp": "2024-01-15T10:35:30Z",
  "checks": {
    "database": { "status": "connected|disconnected" },
    "redis": { "status": "connected|disconnected" },
    "memory": { "usage": "45%" },
    "uptime": "15h 23m"
  }
}
```

### Verificação Periódica

```bash
# Health check a cada 30 segundos
curl -X GET http://localhost:3000/api/health
```

### Uso em Produção

- Load Balancer: Usa `/api/health` para roteamento
- Kubernetes: LivenessProbe + ReadinessProbe
- Alertas: Se status != "up" por 2 min, dispara alerta

## 3. Métricas (Prometheus - Future)

### Métricas Importantes

```
# Endpoint
GET /metrics

# Exemplos
ecommerce_http_requests_total{method="GET",endpoint="/api/products",status="200"} 1523
ecommerce_http_request_duration_seconds{endpoint="/api/products",method="GET"} 0.045
ecommerce_database_query_duration_seconds{query="SELECT products"} 0.032
ecommerce_cache_hits_total{cache="products"} 4521
ecommerce_cache_misses_total{cache="products"} 123
ecommerce_orders_total{status="completed"} 1024
ecommerce_orders_total{status="failed"} 12
ecommerce_payment_processing_duration_seconds 0.234
```

### Dashboard Recomendado (Grafana)

- Response time p50, p95, p99
- Taxa de erro (500s)
- Taxa de sucesso de pagamento
- Número de pedidos por hora
- Cache hit/miss ratio
- DB connections ativas
- CPU/Memory usage

## 4. Tracing Distribuído (Jaeger - Future)

```typescript
// Exemplo: Rastreiar fluxo de checkout
@Traced()
async checkout(orderId: string) {
  // Cada span = uma operação
  // Trace ID conecta todas as operações
}
```

### Exemplo de Trace

```
Trace ID: abc123def456
├─ Span: PaymentController.process (50ms)
│  ├─ Span: PaymentService.validate (10ms)
│  ├─ Span: PaymentService.callStripe (30ms)
│  └─ Span: PaymentService.savePayment (10ms)
├─ Span: OrderService.create (25ms)
│  ├─ Span: OrderRepository.save (15ms)
│  └─ Span: InventoryService.reserve (10ms)
└─ Span: CacheService.invalidate (5ms)
Total: 80ms
```

## 5. Alerts e Notificações

### Cenários de Alerta

```yaml
Alerta                          Threshold    Ação
─────────────────────────────────────────────────────────
API Down                        2 min        Escalate + PagerDuty
High Error Rate                 > 5%         Notify Slack
Payment Failure Rate            > 15%        Investigate
Database Connection Pool Full   95%          Scale + Alert
Cache Miss Rate                 > 50%        Investigate
Response Time P95               > 500ms      Investigate
Disk Space                      > 90%        Scale Volume
Memory Usage                    > 85%        Restart if needed
```

### Integração de Alertas

```typescript
// alert.service.ts
async notifySlack(message: string, severity: 'info'|'warn'|'error') {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  await fetch(webhook, {
    method: 'POST',
    body: JSON.stringify({
      text: message,
      attachments: [
        {
          color: severity === 'error' ? 'danger' : 'warning',
          timestamp: Math.floor(Date.now() / 1000),
        }
      ]
    })
  });
}
```

## 6. Audit Logs

### Operações Críticas a Auditar

```json
{
  "timestamp": "2024-01-15T10:35:30Z",
  "event": "payment_processed",
  "userId": "user-uuid",
  "orderId": "order-uuid",
  "amount": 1299.99,
  "status": "approved",
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0..."
}
```

### Retenção

- Logs de ação: 90 dias
- Logs de erro: 1 ano
- Audit logs críticos: 7 anos (compliance)

## 7. Performance Monitoring

### Métricas por Endpoint

```
GET /api/products
├─ Requests: 1523/hora
├─ P50: 45ms
├─ P95: 120ms
├─ P99: 250ms
├─ Errors: 2 (0.13%)
└─ Cache Hit Rate: 87%

POST /api/payments/process
├─ Requests: 45/hora
├─ P50: 234ms
├─ P95: 450ms
├─ P99: 600ms
├─ Errors: 7 (15.6% - normal, 10% taxa recusa)
└─ Success Rate: 90%
```

### SLA Targets

| Operação | P50 | P95 | P99 | SLA |
|----------|-----|-----|-----|-----|
| GET /products | 45ms | 120ms | 250ms | < 200ms p95 |
| GET /orders | 80ms | 200ms | 400ms | < 300ms p95 |
| POST /checkout | 234ms | 450ms | 600ms | < 500ms p95 |
| POST /payments | 234ms | 500ms | 800ms | < 500ms p95 |

## 8. Centralização de Logs (Recomendado)

### Stack Recomendado (ELK)

```yaml
Aplicação → Elasticsearch ← Kibana
             ↑               (Dashboard)
    Filebeat/Logstash
```

### Alternativas

- Datadog
- New Relic
- Splunk
- AWS CloudWatch

### Configuração Básica

```bash
# Docker compose adicional
elasticsearch:
  image: docker.elastic.co/elasticsearch/elasticsearch:8.0.0
  environment:
    - discovery.type=single-node

kibana:
  image: docker.elastic.co/kibana/kibana:8.0.0
  ports:
    - "5601:5601"
```

## 9. Dashboards Recomendados

### Dashboard de Negócio
- Total de vendas (hoje, esta semana, este mês)
- Número de pedidos
- Ticket médio
- Taxa de conversão
- Produtos mais vendidos

### Dashboard Técnico
- Response times (p50, p95, p99)
- Taxa de erro
- DB queries lentas
- Cache hit/miss
- CPU/Memory/Disk

### Dashboard de Pagamentos
- Sucesso vs. Falha
- Quantidade de transações
- Valor total processado
- Tempo médio de processamento
- Top motivos de recusa

## 10. Monitoramento em Desenvolvimento

```bash
# Ver logs em tempo real
docker-compose logs -f api

# Health check
watch -n 5 'curl -s http://localhost:3000/api/health | jq'

# Performance (top services)
npm run test:cov
```

## Checklist de Observabilidade para Produção

- [ ] Logs centralizados (ELK/Datadog/etc)
- [ ] Health checks a cada 30s
- [ ] Metrics exportadas (Prometheus)
- [ ] Alertas configurados
- [ ] Dashboards implementados (Grafana)
- [ ] Tracing distribuído (Jaeger)
- [ ] Audit logs retidos 7 anos
- [ ] SLAs monitorados
- [ ] Alertas no Slack/PagerDuty
- [ ] Retention policies definidas
- [ ] Backup de logs automático
- [ ] On-call rotation configurada
