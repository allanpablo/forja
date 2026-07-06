# 🏗️ Service Autonomy Patterns

## Pattern: Database per Service
Cada microserviço possui seu próprio database PostgreSQL.

```
┌─────────────────┐
│  auth-service   │─────► auth_db (PostgreSQL)
└─────────────────┘

┌─────────────────┐
│  user-service   │─────► users_db (PostgreSQL)
└─────────────────┘

┌──────────────────────────┐
│ notification-service     │─────► No DB (stateless)
└──────────────────────────┘
```

**Benefícios:**
- Sem lock-in tecnológico
- Escalabilidade independente
- Migração de schema sem sincronização
- Isolamento de falhas

**Trade-offs:**
- Complexidade de transações distribuídas
- Eventual consistency
- Data synchronization via eventos

---

## Pattern: API Gateway
Ponto de entrada único que roteia requisições para os microserviços.

```
Client
  │
  ├──► /auth/*          ──► auth-service:3001
  │
  ├──► /users/*         ──► user-service:3002
  │
  └──► /notifications/* ──► notification-service:3003
```

**Responsabilidades:**
- Roteamento de requisições
- Autenticação/Autorização
- Rate limiting
- Agregação de responses
- Error handling centralizado

---

## Pattern: Service Discovery
Services se registram e descobrem uns aos outros.

```
┌──────────────────┐
│ Service Registry │
│  (DNS / Consul)  │
└──────────────────┘
     ▲
     │ register/deregister
     │
┌────┴────────────────────┐
│  auth-service           │
│  user-service           │
│  notification-service   │
└─────────────────────────┘
```

---

## Pattern: Event-Driven Communication
Serviços se comunicam via RabbitMQ para operações assíncronas.

```
auth-service  ────► [ RabbitMQ ] ────► user-service
                         │
                         └────────► notification-service
```

**Eventos comuns:**
- `user.created`
- `user.email_verified`
- `password.reset_requested`
- `notification.sent`

---

## Pattern: Circuit Breaker
Proteção contra chamadas cascata de falhas.

```
      [CLOSED]  ──failure──>  [OPEN]
        ▲                       │
        │                       │ timeout
        │                    [HALF_OPEN]
        └──────success─────────┘
```

**Estados:**
- **CLOSED**: Normal operation
- **OPEN**: Falhas detectadas, rejeit requests
- **HALF_OPEN**: Testando se serviço recuperou
