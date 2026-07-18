# 📁 Estrutura Completa do Projeto Gerado

Quando você roda `npm run project:new meu-projeto`, o projeto é criado dentro do workspace Forja (`~/forja-workspace/projects/meu-projeto/`). Veja ADR-0019.

## Workspace Forja

```
~/forja-workspace/
├── projects/              # produtos gerados
│   └── meu-projeto/       # projeto individual
├── memory/
│   ├── sqlite/
│   │   └── universal.db   # SQLite FTS5 com índice de todos os produtos
│   └── 30-projects/       # fichas dos projetos
├── specs/                 # specs de produto
├── .context/              # runbooks GSD de produto
└── README.md
```

## Projeto Gerado

```
~/forja-workspace/projects/meu-projeto/
│
├── 📂 memory/                          [Núcleo: Memória Hierárquica]
│   ├── 📂 00-global/
│   │   ├── missao.md                   → Propósito e visão
│   │   ├── padroes.md                  → Convenções de código
│   │   ├── politica-contexto.md        → Limites de token/modelo
│   │   ├── contrato-agentes.md         → Protocolo de comunicação
│   │   └── indice.md                   → Mapa de memória
│   │
│   ├── 📂 10-product/
│   │   ├── visao.md                    → Visão do produto
│   │   ├── personas.md                 → Usuários/agentes
│   │   ├── regras-negocio.md           → Restrições operacionais
│   │   └── nfrs.md                     → Performance, segurança, etc
│   │
│   ├── 📂 20-architecture/
│   │   ├── visao-geral.md              → Diagrama macro
│   │   ├── frontend.md                 → Stack frontend
│   │   ├── backend.md                  → Stack backend (NestJS)
│   │   ├── dados.md                    → BD, cache, indexação
│   │   ├── seguranca.md                → Autenticação, autorização
│   │   └── observabilidade.md          → Logs, métricas, tracing
│   │
│   ├── 📂 30-domains/
│   │   ├── 📂 auth/
│   │   │   ├── context.md              → Bounded context de auth
│   │   │   ├── rules.md                → Regras de negócio
│   │   │   └── api.md                  → Endpoints do domínio
│   │   ├── 📂 billing/
│   │   │   ├── context.md
│   │   │   ├── rules.md
│   │   │   └── api.md
│   │   └── [domínios adicionais]
│   │
│   ├── 📂 40-delivery/
│   │   ├── roadmap.md                  → Planejamento trimestral
│   │   ├── sprint-atual.md             → Sprint em progresso
│   │   └── backlog.md                  → Itens futuros
│   │
│   ├── 📂 50-orchestration/
│   │   ├── topologia.md                → Mapa de agentes
│   │   ├── roteamento.md               → Como messages são roteadas
│   │   ├── handoff-protocol.md         → 7 campos obrigatórios
│   │   ├── playbook-paralelo.md        → Execução paralela segura
│   │   └── 📂 handoffs/
│   │       ├── handoff-20260421-001.md
│   │       ├── handoff-20260421-002.md
│   │       └── [histórico de handoffs]
│   │
│   ├── 📂 60-runs/
│   │   ├── 📂 run-20260421-001/
│   │   │   ├── task.md                 → Tarefa original
│   │   │   ├── decomposicao.md         → Plano de execução
│   │   │   ├── logs.md                 → Output de cada worker
│   │   │   └── resultado.md            → Resumo final
│   │   └── [runs anteriores]
│   │
│   ├── 📂 70-summaries/
│   │   ├── global-summary.md           → Estado geral do projeto
│   │   ├── 📂 domain-summaries/
│   │   │   ├── auth-summary.md
│   │   │   ├── billing-summary.md
│   │   │   └── [por domínio]
│   │   └── [criados/atualizados por runs]
│   │
│   ├── 📂 80-data/
│   │   ├── schema.md                   → Estrutura SQLite
│   │   ├── migration-plan.md           → Evoluções do schema
│   │   └── queries-comuns.md           → Consultas úteis
│   │
│   └── 📂 90-decisions/
│       ├── ADR-0001-v1.md              → Primeira decisão
│       ├── ADR-0002-v1.md
│       ├── ADR-0002-v2.md              → Versão revisada
│       └── [ADRs versionadas]
│
├── 📂 design-md/                       [Biblioteca de Design]
│   ├── INDEX.md                        → Índice de todas as marcas
│   ├── 📂 airbnb/
│   ├── 📂 apple/
│   ├── 📂 stripe/
│   └── [+50 marcas]
│
├── 📂 agents/                          [Especialização por Papel]
│   ├── orchestrator.md                 → Decompõe tarefas
│   ├── backend-nest.md                 → Implementa NestJS
│   ├── frontend.md                     → Implementa UI
│   ├── dba.md                          → Gerencia BD
│   ├── security.md                     → Valida segurança
│   ├── reviewer.md                     → Valida qualidade
│   └── README.md                       → Diretório de agentes
│
├── 📂 skills/                          [Operações Comuns]
│   ├── triage.md                       → Classificar tarefas
│   ├── compactacao.md                  → Reduzir contexto
│   ├── handoff.md                      → Passar para próximo agente
│   └── nest-api.md                     → Gerar endpoints
│
├── 📂 prompts/                         [Templates de Prompts]
│   ├── orchestrator-prompt.md
│   ├── worker-prompt-backend.md
│   ├── worker-prompt-frontend.md
│   ├── reviewer-prompt.md
│   └── handoff-prompt.md
│
├── 📂 scripts/                         [Automação]
│   ├── build-context-pack.mjs          → Compactar contexto
│   ├── append-handoff.mjs              → Criar handoff
│   ├── .context/
│   │   └── context-pack.md             → Output compactado
│   └── package.json
│
├── 📂 .ia-instructions/                [Config por IA]
│   ├── copilot.md                      → Para Copilot/VSCode
│   ├── claude.md                       → Para Claude/claude.ai
│   ├── gemini.md                       → Para Gemini/gemini.ai
│   └── README.md                       → Guia de instrução
│
├── 📂 backend/                         [NestJS (se não --skip-backend)]
│   ├── 📂 src/
│   │   ├── 📂 modules/
│   │   │   ├── 📂 health/
│   │   │   │   ├── health.controller.ts
│   │   │   │   └── health.module.ts
│   │   │   └── [módulos por domínio]
│   │   ├── 📂 middleware/
│   │   │   ├── rate-limit.middleware.ts
│   │   │   └── sanitize.middleware.ts
│   │   ├── 📂 config/
│   │   │   └── database.config.ts
│   │   ├── app.module.ts
│   │   └── main.ts
│   │
│   ├── 📂 scripts/
│   │   ├── memory-db-init.mjs          → Criar BD
│   │   ├── memory-db-sync.mjs          → Sincronizar memória
│   │   ├── memory-db-query.mjs         → Consultar
│   │   └── .sqlite/
│   │       └── context.db              → BD principal
│   │
│   ├── package.json
│   ├── tsconfig.json
│   └── nest-cli.json
│
├── 📂 .git/                            [Git Repository]
│   └── [histórico de commits]
│
├── 📄 .memoryrc.json                   [Configuração de Memória]
│   ├── memoria_size_limits
│   ├── modelo_tokens
│   ├── compactacao_nivel
│   └── politica_retention
│
├── 📄 AGENTS.md                        [Diretório Global de Agentes]
│   ├── Mapa de todos os agentes
│   ├── Responsabilidades
│   ├── Endpoints de comunicação
│   └── Versionamento
│
├── 📄 README.md                        [Documentação do Projeto]
│   ├── Quick start
│   ├── Estrutura
│   ├── Comandos principais
│   └── Links para memória
│
├── 📄 .gitignore
├── 📄 .env
└── 📄 package.json
```

---

## 🎯 Como Usar Cada Pasta

### `memory/00-global/` - Conhecimento Compartilhado
**Use quando**: Onboarding de novo agente, refrescar contexto global
```bash
cat memory/00-global/contrato-agentes.md
# → Entender como IAs devem se comunicar
```

### `memory/30-domains/` - Contexto por Domínio
**Use quando**: Trabalhar em autenticação, billing, etc
```bash
cat memory/30-domains/auth/context.md
# → Entender bounded context de auth
```

### `memory/50-orchestration/` - Coordenação
**Use quando**: Descompor tarefa entre múltiplos agentes
```bash
cat memory/50-orchestration/playbook-paralelo.md
# → Padrão de execução paralela segura
```

### `design-md/` - Biblioteca de Design
**Use quando**: Projetar interfaces, buscar inspiração de UX ou definir padrões visuais
```bash
cat design-md/INDEX.md
# → Ver todas as referências de design disponíveis
```

### `agents/` - Qual Agente Fazer Quê
**Use quando**: Começar trabalho novo
```bash
cat agents/orchestrator.md
# → Orquestrador decide quem faz o quê
```

### `scripts/` - Automação
**Use quando**: Precisar compactar contexto ou criar handoff
```bash
node scripts/build-context-pack.mjs
# → Gera context-pack.md otimizado para token limit

node scripts/append-handoff.mjs
# → Cria handoff pronto para próximo agente
```

### `backend/scripts/` - Gerenciar BD
**Use quando**: Sincronizar memória ou consultar índice
```bash
node backend/scripts/memory-db-init.mjs
# → Criar/resetar BD

node backend/scripts/memory-db-sync.mjs
# → Indexar memory/ em SQLite

node backend/scripts/memory-db-query.mjs \
  --query "SELECT * FROM improvement_items WHERE status='pending'"
# → Consultar rastreamento
```

---

## 📊 Fluxo de Trabalho Completo

### 1️⃣ Iniciar Nova Tarefa
```bash
# Orquestrador lê tarefa
cat memory/40-delivery/sprint-atual.md

# Decide quem faz o quê
cat memory/50-orchestration/topologia.md

# Cria prompt estruturado
cat prompts/orchestrator-prompt.md
```

### 2️⃣ Workers Executam
```bash
# Backend worker pega seu contexto
node scripts/build-context-pack.mjs --role backend

# Implementa em backend/
cd backend && npm run start:dev

# Frontend worker faz o mesmo
node scripts/build-context-pack.mjs --role frontend
```

### 3️⃣ Criar Handoff
```bash
# Após completar trabalho
node scripts/append-handoff.mjs \
  --from backend \
  --to reviewer \
  --changes "Implementado auth endpoints" \
  --riscos "SQLite migration precisa teste"

# Cria: memory/50-orchestration/handoffs/handoff-YYYYMMDD-NNN.md
```

### 4️⃣ Reviewer Valida
```bash
# Reviewer lê handoff
cat memory/50-orchestration/handoffs/handoff-*.md

# Executa prompts de review
cat prompts/reviewer-prompt.md

# Atualiza summaries se OK
node backend/scripts/memory-db-sync.mjs
```

### 5️⃣ Documentar Run
```bash
# Criar pasta de run
mkdir memory/60-runs/run-$(date +%Y%m%d-%H%M%S)

# Log de tudo: task, decomposição, logs, resultado
```

---

## 🔐 Segurança por Pasta

| Pasta | Acesso | Quem Edita |
|-------|--------|-----------|
| `00-global/` | Public | Arquiteto |
| `30-domains/` | Public | Especialista de domínio |
| `50-orchestration/` | Public | Orquestrador |
| `60-runs/` | Private | Workers durante execução |
| `90-decisions/` | Public | Líder técnico |

---

## 💾 Sincronização com SQLite

Após mudanças importantes:
```bash
# 1. Adicionar à memória (manual ou via handoff)
cat memory/30-domains/auth/context.md

# 2. Sincronizar com BD
node backend/scripts/memory-db-sync.mjs

# 3. Consultar progresso
node backend/scripts/memory-db-query.mjs --table improvement_items
```

---

## 🎯 Próximos Passos

1. ✅ Entender a estrutura (você está aqui)
2. Ler `.ia-instructions/copilot.md` (ou claude.md/gemini.md)
3. Rodar `node scripts/build-context-pack.mjs`
4. Chamar primeiro agente com contexto
5. Criar handoff após cada tarefa

---

**Para mais detalhes**, veja:
- [README.md](../README.md)
- [AGENTS.md](../AGENTS.md)
- [DOC-MAP.md](../DOC-MAP.md)
