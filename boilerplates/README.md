# 🏗️ Boilerplates - Casos de Uso Profissionais

Arquiteturas de referência que acompanham o Forja. Elas **não são geradas por um comando**: o
`forja project:new` cria o projeto (memória, agentes, backend NestJS e conexão com a IA), e cada
boilerplate serve de modelo para a IA e para o time adaptarem. Os boilerplates estão indexados no
catálogo: `forja catalog:assets` gera `.context/asset-catalog.md`, e `forja query:universal "<stack>"`
os encontra.

> Geração direta a partir de um boilerplate (`--template`) está no roadmap; até lá, use-os como
> referência.

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
forja project:new meu-projeto   # e use boilerplates/01-api-rest/ como arquitetura de referência
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
forja project:new meu-projeto   # e use boilerplates/02-saas-starter/ como arquitetura de referência
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
forja project:new meu-projeto   # e use boilerplates/03-ecommerce-starter/ como arquitetura de referência
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
forja project:new meu-projeto   # e use boilerplates/04-microservices-starter/ como arquitetura de referência
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
forja project:new meu-projeto   # e use boilerplates/05-monorepo-starter/ como arquitetura de referência
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
forja project:new meu-projeto   # e use boilerplates/06-clean-arch/ como arquitetura de referência
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

## 🚀 Quick Start

### 1. Criar o projeto e escolher a referência
```bash
forja project:new meu-api
forja catalog:assets            # lista os boilerplates (.context/asset-catalog.md)
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
├── AGENTS.md, CLAUDE.md      ← Instruções para IAs (lidas nativamente)
├── .claude/                  ← hooks e sub-agents do Claude Code
├── .mcp.json                 ← servidor MCP do Forja
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

O projeto criado pelo `forja project:new` já sai conectado: Codex, Copilot e Gemini leem o
`AGENTS.md`; o Claude Code lê o `CLAUDE.md` e roda os hooks do Forja ao abrir a sessão.

```bash
cd meu-projeto
forja project:wire --check    # confirma instruções, hooks, sub-agents e MCP
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
