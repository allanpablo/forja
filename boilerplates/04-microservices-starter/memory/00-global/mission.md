# 🎯 Mission

## Visão Geral
Construir uma plataforma de microserviços escalável, resiliente e independente que segue os princípios de **Domain-Driven Design** e **Service Autonomy**.

## Princípios Fundamentais

### 1. Autonomia de Serviço
- Cada microserviço é independente e autossuficiente
- Propriedade completa de dados (database per service)
- Deploy independente sem sincronização
- Comunicação via APIs bem definidas

### 2. Resiliência
- Circuit breakers para falhas de serviço
- Retry policies com exponential backoff
- Graceful degradation
- Health checks e liveness probes

### 3. Observabilidade
- Distributed tracing (OpenTelemetry ready)
- Centralized logging (ELK stack ready)
- Metrics & monitoring
- Correlation IDs em todas as requisições

### 4. Escalabilidade
- Horizontal scaling
- Load balancing via API Gateway
- Message queues para comunicação async
- Caching distribuído com Redis

## Objetivos de Curto Prazo
1. ✅ Setup Docker Compose com todos os serviços
2. ✅ Implementar API Gateway como ponto de entrada único
3. ✅ Configurar Service Discovery (DNS-based)
4. ✅ Integração com RabbitMQ para eventos assíncronos
5. ✅ Shared types package em TypeScript

## Success Criteria
- Cada serviço roda independentemente
- Comunicação cross-service via HTTP REST (síncrona) e RabbitMQ (assíncrona)
- API Gateway roteia requisições corretamente
- Services se recuperam de falhas gracefully
- Código é testável e documentado
