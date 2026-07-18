# 🏗️ Guia para Arquitetos

Você design systems. Quer entender decisões, trade-offs, escalabilidade.

---

## ⏱️ Leia em 30 minutos

### Visão da Arquitetura

**create-memory-nest-kit** é uma **system generator** que cria projetos com:

1. **Hierarquia de memória** — Contexto estruturado em 10 camadas
2. **Orquestração de agentes** — Multi-agent coordination sem deadlock
3. **Backend NestJS modular** — Domínios independentes, escaláveis
4. **Validação + testes** — Automação desde a geração

### Stack Padrão

```
Frontend: (Sua escolha - React, Vue, etc)
    ↓
API Gateway: NestJS (port 3000)
    ├─ GET /api/health
    ├─ GET /ops (dashboard)
    └─ [Seus domínios]
    ↓
Database: SQLite (contexto) + Seu BD principal
    ↓
Memory Index: SQLite contexto (.memory/sqlite/context.db)
    ↓
Agents: Orchestrador + Workers + Reviewer
```

---

## 🏛️ Decisões Arquiteturais

### 1. Modularização por Domínio

**Problema:** Grandes projetos viram bola de lama  
**Solução:** Bounded contexts (DDD)

```
memory/30-domains/
├─ auth/
│  ├─ context.md (o que é auth neste sistema?)
│  ├─ rules.md (as regras)
│  └─ api.md (endpoints)
├─ billing/
│  ├─ context.md
│  ├─ rules.md
│  └─ api.md
└─ [seu domínio]
```

Cada agent trabalha **isolado** por domínio = sem conflitos.

### 2. Contexto em Camadas

**Problema:** 1M+ tokens precisam ser comprimidos  
**Solução:** Smart context loading

```
Camada 1 (sempre): mission.md + standards.md (200 tokens)
Camada 2 (por projeto): vision.md + arquitetura (500 tokens)
Camada 3 (por domínio): [domínio]/context.md (300 tokens)
Camada 4 (tarefas): diffs + ADRs recentes (variável)
= Total compactado: ~1000 tokens vs 10K+ monolítico
```

### 3. Handoff Protocol

**Problema:** Quando agent A termina, agent B perde contexto  
**Solução:** Handoff formal com 7 campos

```markdown
# Handoff: Auth Worker → Reviewer

## Contexto
Implementei validação JWT em GET /api/auth/verify

## Alterações
- src/auth/guards/jwt.guard.ts (novo)
- src/auth/services/auth.service.ts (+50 linhas)

## Riscos
- JWT expiry pode não estar coberto em todos os endpoints

## Pendências
- E2E test para timeout de token

## Próximo passo
Reviewer testa segurança e merge
```

Cada handoff fica registrado em `memory/50-orchestration/handoffs/`

---

## 🔄 Fluxo de Desenvolvimento

```
┌─────────────────┐
│   Orquestrador  │
│ (você, ou agente)
└────────┬────────┘
         │ "Implementar auth"
         ↓
┌─────────────────────────────────────────┐
│ 1. Decompor em subtarefas               │
│    • Auth module setup (backend-nest)   │
│    • JWT validation (security)          │
│    • E2E tests (backend-nest)           │
│    • DB schema (dba)                    │
└──┬──────────────┬──────────────┬────────┘
   │              │              │
   ↓              ↓              ↓
┌───────────┐ ┌────────┐ ┌──────────┐
│ Backend   │ │Security│ │   DBA    │
│ Worker    │ │ Worker │ │  Worker  │
│ (parallel)│ │(parallel)│(parallel)│
└──┬───────┘ └───┬────┘ └──┬───────┘
   │             │         │
   └─────┬───────┴────┬────┘
         ↓            ↓
    [Handoffs Registrados]
         │
         ↓
    ┌──────────┐
    │ Reviewer │
    │  Agent   │ ✅ Aprovado ou ❌ Bloqueado
    └──┬───────┘
       │
       ↓
   [Merge + Deploy]
```

---

## 📊 Padrões de Escalabilidade

### Cenário 1: Projeto Pequeno (1 domain)

```
Você = Orquestrador + 1 Worker
Features: 1-2 /sprint
Memória: ~50KB
Tokens/sessão: ~2K
```

### Cenário 2: Projeto Médio (3-5 domains)

```
Você = Orquestrador
Workers: Backend + Frontend + DBA + Security
Features: 3-5 /sprint
Memória: ~500KB
Tokens/sessão: ~5K (compactado via layers)
```

### Cenário 3: Projeto Grande (6+ domains, 3+ squads)

```
Orquestrador-Agent = coordinação automática
Per-squad: 1 Orchestrator + 3-4 workers + reviewer
Features: 8-15 /sprint
Memória: ~2-5MB (distributed por squad)
Tokens/sessão: ~1000 (smart context)
Cross-domain: Revisor-gatekeeper valida integrações
```

---

## 🔐 Segurança

### Built-in

- ✅ **Input validation** — DTO obrigatório
- ✅ **Rate limiting** — Middleware pronto
- ✅ **CORS** — Configurável
- ✅ **Helmet** — Headers de segurança

### Sua responsabilidade

- 🔑 **Secrets** — .env (fora do git)
- 🔐 **DB access** — Connection pooling, encryption at rest
- 🛡️ **Auth** — JWT + refresh tokens (exemplo em memoria/30-domains/auth)

---

## 🧪 Qualidade Esperada

### Testes

```
Unit Tests: Controllers + Services (>80% coverage)
E2E Tests: Happy path + error cases
Security Tests: OWASP Top 10
```

### CI/CD

```
GitHub Actions (sugestão):
1. Lint (ESLint + Prettier)
2. Build (tsc)
3. Tests (Jest com coverage)
4. Security scan (snyk ou dependabot)
5. Deploy (your infra)
```

---

## 📈 Performance

### Memory DB

- **Reads:** <10ms (SQLite in-process)
- **Writes:** Async batch (não bloqueia API)
- **Query:** FTS5 para texto livre

### API

- **Health check:** <1ms
- **Ops dashboard:** <50ms (agregação via SQLite)
- **User endpoints:** Depende de sua lógica

### Scaling

```
1 dyno/pod: até 1000 req/s
Múltiplos: Load balancer + shared DB
Multi-region: Deploy em N regiões, SQS/Redis para sync
```

---

## 🎯 Primeiros Passos

### 1. Gerar e explorar (10 min)

```bash
npm run workspace:init
npm run project:new meu-produto
cd ~/forja-workspace/projects/meu-produto
cat memory/20-architecture/system-overview.md
cat memory/30-domains/auth/context.md
```

### 2. Entender o projeto (20 min)

```bash
# Ver o NestJS gerado
ls -la backend/src/
cat backend/src/app.module.ts

# Entender a topologia
cat memory/50-orchestration/topology.md
```

### 3. Adicionar seu domínio (15 min)

```bash
# Criar novo domínio
mkdir -p memory/30-domains/seu-dominio
cat > memory/30-domains/seu-dominio/context.md << EOF
# Seu Domínio

[Descrição breve do escopo]
EOF
```

### 4. Gerar primeira feature (30 min)

Seguir [Guia de Developer](../developer/README.md)

---

## 🚀 Decisões que Você Precisa Tomar

### 1. Qual banco de dados principal?

- **PostgreSQL** → Production-grade, recomendado
- **MySQL** → Alternativa
- **SQLite** → Dev apenas (single process)

### 2. Qual frontend?

- **React** → Recomendado, maior comunidade
- **Vue** → Alternativa
- **Sua escolha** → Integrar depois

### 3. Quantos agentes simultâneos?

- **1-2** → Você mesmo (para MVP)
- **3-5** → Squad de dev
- **6+** → Múltiplas squads + orquestrador-agente

### 4. Qual cloud?

- **Vercel** (frontend) + **Heroku/Railway** (backend) → MVP
- **AWS** (EC2/ECS) + **RDS** → Production
- **GCP/Azure** → Alternativas

---

## 🔗 Referências Técnicas

| Documento | Quando ler |
|-----------|-----------|
| [AGENTS.md](../../../AGENTS.md) | Os 6 papéis e a topologia |
| [memory/90-decisions/](../../../memory/90-decisions/) | ADRs com rationale |
| [structure.md](../../structure.md) | Estrutura de diretórios |
| [agent-harnesses.md](../../agent-harnesses.md) | Harness e ferramentas de processo |

---

## 📋 Checklist de Onboarding (Arquiteto)

- [ ] Li este guia (30 min)
- [ ] Rodei o generator (5 min)
- [ ] Explorei memory/20-architecture/ (10 min)
- [ ] Defini minha topologia de domínios (20 min)
- [ ] Criei primeiros ADRs em memory/90-decisions/ (15 min)
- [ ] Passei para [Guia de Developer](../developer/README.md)

---

**Tempo total:** ~1.5h até ready  
**ROI:** Arquitetura clara = menos refactoring depois

📞 Próximo: Repasse o [Guia de Developer](../developer/README.md) ao seu squad
