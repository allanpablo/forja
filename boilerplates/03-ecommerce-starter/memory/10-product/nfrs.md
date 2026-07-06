# Requisitos Não-Funcionais (NFRs)

## Performance
| Requisito | Target | Método |
|-----------|--------|--------|
| Listagem de produtos | < 200ms p95 | Índices + paginação + cache |
| Busca/filtro | < 300ms p95 | Full-text search + índices |
| Checkout (validate+process) | < 500ms p95 | Transações atômicas + otimização |
| Response time geral | < 100ms p50 | CDN para estáticos, cache em camadas |

## Escalabilidade
- **Throughput**: 1000 concurrent users
- **Armazenamento**: 10k+ produtos no catálogo
- **Conexões DB**: Connection pooling com 20 conexões
- **Cache**: Redis com 1GB limite inicial
- **Estratégia**: Pronto para sharding no futuro

## Disponibilidade
- **Uptime**: 99.9% (máximo 43 min/mês downtime)
- **RTO** (Recovery Time Objective): 15 minutos
- **RPO** (Recovery Point Objective): < 5 minutos (backups a cada 5min)
- **Health Check**: `/api/health` a cada 30s

## Segurança
- **Encryption**: TLS 1.3 em trânsito
- **Authentication**: JWT com expiry 1h, refresh token 30 dias
- **Authorization**: RBAC (user, admin)
- **Input Validation**: Todas as entradas (length, type, format)
- **SQL Injection**: TypeORM parameterizado (protected)
- **CORS**: Apenas origins registradas
- **CSRF**: Tokens no formulário (POST/PUT/DELETE)
- **Rate Limiting**: 100 req/min por IP
- **Secrets**: Variáveis de ambiente, nunca em código

## Manutenibilidade
- **Código**: TypeScript strict, 80%+ test coverage
- **Logs**: Estruturados (JSON), níveis (info, warn, error)
- **Observabilidade**: Health checks, metricas Prometheus (future)
- **Documentação**: Cobertura 100% de APIs via Swagger
- **CI/CD**: Testes automáticos antes de merge

## Compliance
- **LGPD**: Direito ao esquecimento, consentimento explícito
- **PCI-DSS**: Mock Stripe (dados reais fora do escopo MVP)
- **Auditoria**: Logs de operações críticas (pagamentos, exclusões)
- **Backup**: Daily backups, retention 30 dias

## Confiabilidade
- **Idempotência**: Operações críticas (pagamento, pedido) retentáveis
- **Graceful Degradation**: Cache falha → chama DB
- **Retry Logic**: Exponential backoff para chamadas externas
- **Falha em Cascata**: Circuit breaker para dependências externas (future)

## Compatibilidade
- **Browsers**: Chrome, Firefox, Safari, Edge (últimas 2 versões)
- **Mobile**: Responsivo (iOS Safari, Android Chrome)
- **APIs**: Versionada (/api/v1), backward compatible

## Disaster Recovery
- **Backup**: Daily full backup + hourly WAL
- **Replica**: Standby PostgreSQL para failover (future)
- **Testado**: DR drills mensais
