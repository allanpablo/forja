# 🏗️ Boilerplates - Casos de Uso Profissionais

Exemplos prontos para produção usando **create-memory-nest-kit**.

Cada boilerplate é um projeto completo com:
- ✅ Estrutura hierárquica de memória
- ✅ Backend NestJS funcional
- ✅ Autenticação e segurança
- ✅ Testes E2E
- ✅ Documentação completa
- ✅ Docker & deployment

---

## 📦 Templates Disponíveis

### 🔌 1. API REST
**Para**: APIs RESTful simples, microserviços, backends genéricos

```bash
node ../bin/init-project.js meu-projeto --template api-rest
```

**Inclui**:
- CRUD de produtos
- Autenticação JWT
- Rate limiting
- Paginação e filtros
- Testes E2E
- Documentação com exemplos curl

**Use quando**: Precisar de uma API limpa, bem estruturada

[Abrir 📂](./01-api-rest)

---

### 💼 2. SaaS
**Para**: Aplicações multi-tenant, subscriptions, billing

```bash
node ../bin/init-project.js meu-projeto --template saas
```

**Inclui**:
- Autenticação com planos
- Subscription management
- Billing mock
- Organização multi-tenant
- Role-based access control
- Testes

**Use quando**: Construir SaaS com múltiplos clientes, subscriptions

[Abrir 📂](./02-saas)

---

### 🛍️ 3. E-Commerce
**Para**: Lojas online, marketplaces, checkout

```bash
node ../bin/init-project.js meu-projeto --template ecommerce
```

**Inclui**:
- Catálogo de produtos
- Carrinho de compras
- Checkout
- Gerenciamento de pedidos
- Inventário
- Cupons e descontos

**Use quando**: Montar e-commerce, marketplace

[Abrir 📂](./03-ecommerce)

---

### 🔀 4. Microserviços
**Para**: Arquiteturas distribuídas, orquestração

```bash
node ../bin/init-project.js meu-projeto --template microservices
```

**Inclui**:
- Auth service
- User service
- Message queue (RabbitMQ)
- Service discovery
- Fault tolerance
- Distributed tracing

**Use quando**: Escalar para microserviços, arquitetura distribuída

[Abrir 📂](./04-microservices)

---

### 📦 5. Monorepo
**Para**: Monorepositórios, full-stack em um só lugar

```bash
node ../bin/init-project.js meu-projeto --template monorepo
```

**Inclui**:
- Backend (NestJS)
- Frontend (React/Next.js)
- Shared libraries
- Turborepo setup
- Build pipeline
- Shared types

**Use quando**: Full-stack em um repositório

[Abrir 📂](./05-monorepo)

---

### 🧱 6. Clean Architecture (Calibrada)
**Para**: Produtos com regra de negócio de verdade — DDD por camadas, sem cerimônia

```bash
node ../bin/init-project.js meu-projeto --template clean-arch
```

**Inclui**:
- Fatia rica (Orders): domain / application / infrastructure / presentation, com inversão de dependência
- Caminho enxuto (Products): CRUD em 1 camada, lado a lado — a calibração visível
- Invariante de domínio testável **sem subir o Nest**
- Memória por bounded context (linguagem ubíqua) para leitura barata por agente
- `WHEN-CLEAN-WHEN-LEAN.md`: o critério de quando usar cada padrão

**Use quando**: há invariante de negócio ou máquina de estados. Para CRUD puro, prefira um dos flat acima.

[Abrir 📂](./06-clean-arch)

---

### 📊 6. Dashboard Admin
**Para**: Painel administrativo, gestão interna

```bash
node ../bin/init-project.js meu-projeto --template dashboard-admin
```

**Inclui**:
- RBAC avançado
- Dashboard com gráficos
- Gestão de usuários
- Auditoria e logs
- Relatórios
- Dark mode

**Use quando**: Construir admin interno, painel gerencial

[Abrir 📂](./06-dashboard-admin)

---

## 🚀 Quick Start

### 1. Escolher Template
```bash
# Listar templates disponíveis
node ../bin/init-project.js --list-templates

# Escolha um:
node ../bin/init-project.js meu-api --template api-rest
```

### 2. Setup
```bash
cd meu-api
npm install
npm run start:dev
```

### 3. Explorar
```bash
# Ver estrutura
ls -la

# Ler documentação
cat README.md

# Ver exemplos
cat backend/test/
```

### 4. Customizar
```bash
# Estrutura de memória
cd memory/30-domains/
# Adicionar novo domínio, regras, etc

# Implementação
cd ../backend/src/modules/
# Adicionar novos módulos
```

---

## 📚 Estrutura Comum

Cada boilerplate segue este padrão:

```
template/
├── memory/                    ← Conhecimento hierárquico
│   ├── 00-global/            ← Context compartilhado
│   ├── 10-product/           ← Visão do produto
│   ├── 20-architecture/      ← Arquitetura
│   ├── 30-domains/           ← Domínios de negócio
│   ├── 40-delivery/          ← Roadmap
│   ├── 50-orchestration/     ← Orquestração
│   ├── 60-runs/              ← Logs de execução
│   ├── 70-summaries/         ← Resumos
│   ├── 80-data/              ← Documentação BD
│   └── 90-decisions/         ← ADRs
│
├── backend/                   ← NestJS API
│   ├── src/
│   │   ├── modules/          ← Feature modules
│   │   ├── config/           ← Configuration
│   │   ├── middleware/       ← Middleware
│   │   ├── filters/          ← Exception filters
│   │   └── app.module.ts
│   ├── test/                 ← E2E tests
│   ├── scripts/              ← Automação
│   └── docker-compose.yml    ← Infrastructure
│
├── .ia-instructions/         ← Instruções para IAs
│   ├── copilot.md
│   ├── claude.md
│   ├── gemini.md
│   └── codex.md
│
├── README.md                 ← Documentação
├── .env.example             ← Exemplo de config
└── setup.sh                 ← Script de setup
```

---

## 🔧 Customização

### Adicionar Novo Domínio

```bash
mkdir -p memory/30-domains/novo-dominio
cat > memory/30-domains/novo-dominio/context.md << EOF
# Contexto de Novo Domínio

## Responsabilidades
- ...

## Entidades
- ...
EOF
```

### Adicionar Novo Endpoint

```bash
# Criar módulo
nest generate module modules/novo-endpoint

# Ver exemplos
cat backend/src/modules/products/
```

---

## 📊 Comparação de Templates

| Feature | API REST | SaaS | E-commerce | Microserviços | Monorepo | Dashboard |
|---------|----------|------|------------|---------------|----------|-----------|
| **Autenticação** | JWT | JWT + Planos | JWT | Service | JWT | RBAC |
| **BD Exemplar** | Produtos | Subscriptions | Pedidos | Múltiplas | Shared | Logs |
| **Frontend** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Pagamentos** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Multi-tenant** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Message Queue** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Complexidade** | 🟢 | 🟡 | 🟡 | 🔴 | 🔴 | 🟡 |
| **Tempo Setup** | 5 min | 5 min | 5 min | 10 min | 10 min | 10 min |

---

## 🤖 Usar com IAs

Cada boilerplate inclui instruções para Copilot, Claude, Gemini e Codex:

```bash
cd meu-projeto
cat .ia-instructions/copilot.md    # Para Copilot
cat .ia-instructions/claude.md     # Para Claude
cat .ia-instructions/gemini.md     # Para Gemini
cat .ia-instructions/codex.md      # Para Codex
```

---

## 📝 Desenvolvimento

### Adicionar Feature

```bash
# 1. Criar issue no memory
echo "## Nova Feature" >> memory/40-delivery/sprint-atual.md

# 2. Gerar módulo
nest generate module modules/feature

# 3. Implementar
# ... código ...

# 4. Testar
npm run test:e2e

# 5. Documentar
# ... atualizar README.md ...
```

### Rodar Testes

```bash
# Testes unitários
npm run test

# E2E
npm run test:e2e

# Coverage
npm run test:cov
```

---

## 🐳 Docker

Cada boilerplate tem `docker-compose.yml`:

```bash
docker-compose up -d

# Acessar
curl http://localhost:3000/api/health
```

---

## 📤 Deploy

### Heroku
```bash
git push heroku main
```

### AWS
```bash
# Build
npm run build

# Deploy image
docker build -t app .
```

### Docker
```bash
docker build -t my-app .
docker run -p 3000:3000 my-app
```

---

## 🆘 Troubleshooting

**Erro: "PORT already in use"**
```bash
# Mudar porta
PORT=3001 npm run start:dev
```

**Erro: "Cannot find module"**
```bash
rm -rf node_modules package-lock.json
npm install
```

**BD não conecta**
```bash
# Verificar docker-compose
docker-compose ps

# Resetar
docker-compose down -v
docker-compose up -d
```

---

## 📚 Recursos Adicionais

- [create-memory-nest-kit README](../README.md)
- [Documentação Completa](../INDICE-MASTER.md)
- [Exemplos de Código](../EXEMPLOS-CODIGO.md)
- [Guia de Implementação](../IMPLEMENTACAO-FASE1.md)

---

## 🎯 Próximas Etapas

1. ✅ Escolher template
2. ✅ Rodar `npm install` e `npm run start:dev`
3. ✅ Explorar código
4. ✅ Ler documentação por template
5. ✅ Customizar conforme necessário
6. ✅ Deploy!

---

**Versão**: 0.3.1+  
**Status**: 🟢 Production-Ready  
**Templates**: 6 disponíveis
