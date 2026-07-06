# 🚀 START HERE - SaaS Starter

Bem-vindo ao boilerplate SaaS Starter!

## ⏱️ 5-Minute Setup

```bash
# 1. Navegar ao projeto
cd boilerplates/02-saas-starter

# 2. Instalar dependências
npm install

# 3. Iniciar banco de dados
docker-compose up -d

# 4. Configurar ambiente
cp .env.example .env.local

# 5. Rodar servidor
npm run start:dev

# ✅ Pronto! Servidor rodando em http://localhost:3000
```

## 🎯 Primeiros Passos

### 1. Testar API

Abra um novo terminal:

```bash
# Signup (criar usuário + organização)
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "founder@example.com",
    "password": "SecureP@ss123",
    "organizationName": "My Startup"
  }'
```

Você receberá:
```json
{
  "data": {
    "user": { "id": "...", "email": "founder@example.com" },
    "organization": { "id": "...", "name": "My Startup", "plan": "free" },
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

Salve o `accessToken` para os próximos passos.

### 2. Consultar API Docs

Abra no navegador:

```
http://localhost:3000/api/docs
```

Veja todos os endpoints documentados com Swagger.

### 3. Testar Upgrade de Plano

```bash
curl -X POST http://localhost:3000/api/subscriptions/{subscription-id}/upgrade \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{ "newPlan": "pro" }'
```

### 4. Processar Pagamento (Mock)

```bash
curl -X POST http://localhost:3000/api/billing/charge \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 99.00,
    "description": "Pro Plan - January 2024"
  }'
```

Retorna invoice com mock payment (90% sucesso, 10% falha para teste).

## 📚 Documentação

### Para Começar Rápido
- **[README.md](./README.md)** — Overview do projeto
- **[QUICK_START.md](./QUICK_START.md)** — Setup detalhado + troubleshooting
- **[INFO.md](./INFO.md)** — Informações gerais do projeto

### Para Entender o Projeto
- **[memory/00-global/index.md](./memory/00-global/index.md)** — Índice de toda documentação
- **[memory/00-global/patterns.md](./memory/00-global/patterns.md)** — Code patterns & conventions
- **[memory/20-architecture/overview.md](./memory/20-architecture/overview.md)** — Arquitetura completa

### Para Usar APIs Específicas
- **[memory/30-domains/auth/api.md](./memory/30-domains/auth/api.md)** — Auth endpoints
- **[memory/30-domains/subscriptions/api.md](./memory/30-domains/subscriptions/api.md)** — Subscription endpoints
- **[memory/30-domains/billing/api.md](./memory/30-domains/billing/api.md)** — Billing endpoints

### Para Expandir
- **[memory/40-delivery/roadmap.md](./memory/40-delivery/roadmap.md)** — 12-month roadmap
- **[memory/80-data/schema.md](./memory/80-data/schema.md)** — Database schema

## 🏗️ Estrutura do Projeto

```
boilerplates/02-saas-starter/
├── backend/                  # NestJS aplicação
│   ├── src/
│   │   ├── modules/         # Auth, Users, Organizations, Subscriptions, Billing
│   │   ├── common/          # Guards, decorators
│   │   └── config/          # Database, JWT
│   └── package.json
├── memory/                   # Documentação (10 níveis)
│   ├── 00-global/           # Mission, patterns, policies
│   ├── 10-product/          # Vision, personas, rules
│   ├── 20-architecture/     # Tech decisions
│   ├── 30-domains/          # Auth, subscriptions, billing
│   ├── 40-delivery/         # Roadmap, sprints
│   ├── 50-orchestration/    # Agent topology
│   ├── 60-runs/             # Execution logs
│   ├── 70-summaries/        # Executive summaries
│   ├── 80-data/             # Schema
│   └── 90-decisions/        # ADRs
├── docker-compose.yml       # Database & cache
├── .env.example            # Environment config
├── README.md               # Project overview
└── QUICK_START.md          # Setup guide
```

## 🔑 Características

✅ **Multi-Tenant** — Isolamento seguro de dados  
✅ **JWT Auth** — Autenticação stateless  
✅ **RBAC** — Owner, admin, member roles  
✅ **Subscriptions** — Free, pro, enterprise plans  
✅ **Billing** — Mock Stripe integration  
✅ **TypeScript** — Strict mode, type-safe  
✅ **Well-Documented** — 30+ docs, 10-level memory  
✅ **Production-Ready** — Error handling, validation  

## 💡 Primeiras Modificações

### Adicionar um novo endpoint

1. **Criar DTO**
   ```typescript
   // backend/src/modules/subscriptions/dto/create-subscription.dto.ts
   export class CreateSubscriptionDto {
     @IsString()
     plan: string;
   }
   ```

2. **Adicionar ao Service**
   ```typescript
   // backend/src/modules/subscriptions/subscriptions.service.ts
   async create(dto: CreateSubscriptionDto) {
     // lógica aqui
   }
   ```

3. **Expor no Controller**
   ```typescript
   // backend/src/modules/subscriptions/subscriptions.controller.ts
   @Post()
   create(@Body() dto: CreateSubscriptionDto) {
     return this.subsService.create(dto);
   }
   ```

4. **Testar**
   ```bash
   npm run test:e2e
   ```

### Adicionar um novo módulo

1. Criar pasta em `backend/src/modules/new-module/`
2. Criar entity, service, controller, module
3. Registrar em `backend/src/app.module.ts`
4. Documentar em `memory/30-domains/new-module/`

## 🛠️ Comandos Úteis

```bash
# Desenvolvimento
npm run start:dev          # Hot reload
npm run format             # Format code
npm run lint              # Lint

# Testes
npm run test              # Unit tests
npm run test:cov          # Coverage
npm run test:e2e          # E2E tests

# Produção
npm run build             # Build
npm run start:prod        # Run production build

# Database
npm run migration:create  # Create migration
npm run migration:run     # Run migrations
```

## 🐛 Troubleshooting

### Erro: "Port 3000 already in use"
```bash
lsof -i :3000
kill -9 {PID}
npm run start:dev
```

### Erro: "Cannot connect to database"
```bash
docker-compose ps
docker-compose logs postgres
docker-compose down && docker-compose up -d
```

### Erro: "Module not found"
```bash
rm -rf node_modules package-lock.json
npm install
```

## 📞 Perguntas?

1. Consulte [README.md](./README.md) para overview
2. Veja [QUICK_START.md](./QUICK_START.md) para setup detalhado
3. Navegue [memory/00-global/index.md](./memory/00-global/index.md) para índice de docs
4. Abra http://localhost:3000/api/docs para API docs

## 🎓 Próximas Etapas

1. ✅ Setup e teste básico (você está aqui)
2. Explore arquitetura em [memory/20-architecture/](./memory/20-architecture/)
3. Customize lógica de negócio
4. Adicione um novo módulo
5. Deploy em produção
6. Scale com observability

## ✨ Bom desenvolvimento!

Este projeto foi desenvolvido para você lançar sua SaaS em semanas, não meses.

**Tudo está pronto. Agora é com você! 🚀**

---

**Precisa de ajuda?** Consulte a documentação completa em [memory/00-global/index.md](./memory/00-global/index.md)
