# 🚀 Init Project - Guia de Uso

Comando universal para iniciar novo projeto com agentes orquestrados e configuração automática de IAs.

> **Atenção**: projetos de produto vivem no **workspace Forja** (`~/forja-workspace` por padrão), fora do repo do framework. Veja ADR-0019.

---

## Quick Start (2 minutos)

```bash
# 1. Ir para repo root do framework Forja
cd /home/apk/Documentos/GitHub/Projetos/2-Projeto-Agents/projects/forja

# 2. Inicializar o workspace (canto fixo dos projetos)
npm run workspace:init

# 3. Criar novo projeto (setup automático completo)
npm run project:new meu-projeto

# 4. Entrar no projeto
cd ~/forja-workspace/projects/meu-projeto

# 5. Ver estrutura
ls -la
tree memory/ | head -30

# 6. Carregar instruções para sua IA favorita
cat .ia-instructions/copilot.md
cat .ia-instructions/claude.md
cat .ia-instructions/gemini.md
```

**Resultado**: Projeto totalmente setup com:
- ✅ Estrutura de memória hierárquica
- ✅ Backend NestJS pronto
- ✅ Instruções para 3 IAs (Copilot, Claude, Gemini)
- ✅ SQLite inicializado
- ✅ Context pack construído
- ✅ Git configurado

---

## Sintaxe Completa

```bash
# Via harness (recomendado — resolve workspace automaticamente)
npm run project:new <project-name> [opções]

# Via binário direto (ainda válido, mas sempre cria no workspace)
node bin/init-project.js <project-name> [opções]
```

### Opções

| Flag | Padrão | O quê |
|------|--------|-------|
| `--ai <list>` | copilot,claude,gemini,codex | IAs para configurar (comma-separated) |
| `--skip-backend` | false | Pula geração do backend NestJS |
| `--skip-db` | false | Pula inicialização do SQLite |
| `--skip-git` | false | Pula inicialização do Git |
| `--skip-design` | false | Pula cópia da biblioteca design-md |
| `--interactive` | false | Modo interativo (perguntas) |
| `--verbose` | false | Output detalhado |

### Workspace

O caminho do workspace é resolvido por prioridade:

1. Variável de ambiente `FORJA_WORKSPACE`
2. Campo `workspaceRoot` em `~/.forjarc.json`
3. Padrão: `~/forja-workspace`

---

## Exemplos de Uso

### 1. Setup Completo (Recomendado)
```bash
npm run project:new meu-projeto
```
Resultado:
- Projeto em `~/forja-workspace/projects/meu-projeto/`
- Estrutura memória + backend NestJS
- IAs: Copilot, Claude, Gemini, Codex
- Git inicializado
- DB setup

### 2. Só com Copilot e Claude
```bash
npm run project:new meu-projeto -- --ai copilot,claude
```
Resultado:
- Instruções apenas para Copilot e Claude
- Resto completo

### 3. Só Memória (Sem Backend)
```bash
npm run project:new meu-projeto -- --skip-backend
```
Resultado:
- Estrutura memória + agentes + skills
- SEM backend NestJS
- SEM npm install
- Útil para projetos frontend-only

### 4. Backend sem DB
```bash
npm run project:new meu-projeto -- --skip-db
```
Resultado:
- Projeto completo
- SQLite NÃO inicializado
- Útil se quer setupar BD depois

### 5. Setup Verbose (Debug)
```bash
npm run project:new meu-projeto -- --verbose
```
Resultado:
- Mostra todos os comandos executados
- Útil para troubleshooting

### 6. Modo Interativo (Perguntas)
```bash
npm run project:new -- --interactive
```
Resultado:
- Pergunta nome do projeto
- Pergunta quais IAs configurar
- Pergunta se quer backend
- Etc

---

## O que o Comando Faz (Step-by-Step)

### 1️⃣ Git Init
- Cria `.git` se não existir
- Cria `.gitignore` básico

### 2️⃣ Generate Structure
- Roda `bin/create-memory-nest-kit.js`
- Cria `memory/`, `agents/`, `skills/`, `prompts/`
- Cria `backend/` (se não --skip-backend)
- Cria scripts úteis

### 3️⃣ Copy Instructions
- Copia `.github/copilot-instructions.md`
- Copia `CLAUDE.md`
- Copia `.gemini-instructions.md`
- Coloca em `.ia-instructions/README.md`

### 4️⃣ Install Backend
- Roda `npm install` no backend
- Instala: NestJS, Jest, Prettier, ESLint, etc
- Toma alguns minutos na primeira vez

### 5️⃣ Init Memory DB
- Roda `npm run memory:db:init`
- Cria `.memory/sqlite/context.db`
- Setup schema SQLite

### 6️⃣ Build Context Pack
- Roda `node scripts/build-context-pack.mjs`
- Cria `.context/context-pack.md`
- Resumo compacto para IA ler

### 7️⃣ Show Next Steps
- Exibe checklist de próximos passos
- Mostra comandos importantes

---

## Estrutura Criada

Após `npm run project:new meu-projeto`, o projeto é criado em `~/forja-workspace/projects/meu-projeto/`:

```
~/forja-workspace/projects/meu-projeto/
├─ .git/                          # Git repository
├─ .gitignore
├─ .ia-instructions/              # Instruções por IA
│  ├─ README.md
│  ├─ copilot.md
│  ├─ claude.md
│  └─ gemini.md
├─ .context/
│  └─ context-pack.md             # Resumo compacto
├─ .memory/
│  └─ sqlite/
│     └─ context.db               # SQLite DB
├─ memory/                         # Estrutura hierárquica
│  ├─ 00-global/
│  ├─ 10-product/
│  ├─ 20-architecture/
│  ├─ 30-domains/
│  ├─ 40-delivery/
│  ├─ 50-orchestration/
│  ├─ 60-runs/
│  ├─ 70-summaries/
│  ├─ 80-data/
│  └─ 90-decisions/
├─ agents/                        # Especificação de agentes
│  ├─ orchestrator.md
│  ├─ backend-nest.md
│  ├─ frontend.md
│  ├─ dba.md
│  ├─ security.md
│  ├─ reviewer.md
│  └─ README.md
├─ skills/                        # Skills operacionais
│  ├─ triage-task/
│  ├─ context-compaction/
│  ├─ handoff/
│  └─ nest-api/
├─ prompts/                       # Templates de prompts
│  ├─ project-prompt-base.md
│  ├─ multi-agent-orchestrator.md
│  └─ worker-task-template.md
├─ scripts/
│  ├─ build-context-pack.mjs      # Compactar contexto
│  └─ append-handoff.mjs          # Criar handoff
├─ docs/                          # Documentação adicional
├─ backend/                       # NestJS (se não --skip-backend)
│  ├─ src/
│  ├─ test/
│  ├─ scripts/
│  │  ├─ memory-db-init.mjs
│  │  ├─ memory-db-sync.mjs
│  │  ├─ memory-db-query.mjs
│  │  └─ memory-db-schema.sql
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ nest-cli.json
├─ README.md
└─ AGENTS.md
```

---

## Workflow Após Init

### Copilot / Claude / Gemini Setup

```bash
# 1. Ver instruções
cat ~/forja-workspace/projects/meu-projeto/.ia-instructions/copilot.md

# 2. Copiar para IA assistant
# - Abra seu editor com Copilot/Claude
# - New chat
# - Paste conteúdo do arquivo
# - Pronto! IA entende seu projeto

# 3. Pedir para IA:
# "Implemente endpoint GET /users/:id com validação de UUID"
# "Crie teste para criar novo usuário"
# etc
```

### Desenvolvimento Local

```bash
cd ~/forja-workspace/projects/meu-projeto

# Ver estrutura de memória
tree memory/ -L 2

# Carregar contexto para IA
cat .context/context-pack.md | head -100

# Iniciar backend em dev
cd backend && npm run start:dev

# Rodar testes
cd backend && npm test

# Sincronizar BD (após mudanças grandes)
cd backend && npm run memory:db:sync

# Consultar contexto
cd backend && npm run memory:db:query -- "search" "auth" 10
```

### Registrar Handoff (Quando Passar para Outro Agente)

```bash
cd meu-projeto

# Criar handoff estruturado
node scripts/append-handoff.mjs orchestrator backend-nest "Implementar módulo de autenticação com JWT"

# Resultado: novo arquivo em memory/50-orchestration/handoffs/
```

### Atualizar Documentação

```bash
# Após mudanças importantes
vim memory/20-architecture/backend.md
vim memory/30-domains/auth/rules.md

# Sincronizar DB
cd backend && npm run memory:db:sync
```

---

## Troubleshooting

### "Node not found"
```bash
# Instalar Node.js >= 18
curl -fsSL https://fnm.io/install | bash
fnm install 18
fnm use 18
node --version
```

### "npm install falha"
```bash
# Limpar cache
npm cache clean --force

# Atualizar npm
npm install -g npm@latest

# Tentar novamente
node bin/init-project.js meu-projeto --verbose
```

### "Git conflicts"
```bash
# Se projeto já existe com Git
node bin/init-project.js meu-projeto --force --skip-git
```

### "BD não inicializa"
```bash
# Manual
cd meu-projeto/backend
npm run memory:db:init
npm run memory:db:sync
```

### "Backend não compila"
```bash
# Debug detalhado
cd meu-projeto/backend
npm run build -- --verbose
npm run lint
npm test
```

---

## Integração com CI/CD

### GitHub Actions

```yaml
# .github/workflows/init-new-project.yml
name: Create New Project
on:
  workflow_dispatch:
    inputs:
      project_name:
        description: "Nome do projeto"
        required: true

jobs:
  init:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
      
      - name: Init project
        run: |
          node bin/init-project.js ${{ github.event.inputs.project_name }} \
            --ai copilot,claude,gemini
      
      - name: Commit and push
        run: |
          git config user.email "bot@example.com"
          git config user.name "Bot"
          git add .
          git commit -m "feat: init project ${{ github.event.inputs.project_name }}"
          git push
```

---

## Próximas Features Planejadas

- [ ] --ai-config: arquivo YAML com config por IA
- [ ] --template: escolher template (web, api, fullstack)
- [ ] --preset: preset de IAs (solo, team, enterprise)
- [ ] --github-org: criar repo automático
- [ ] --docker: Dockerfile pronto
- [ ] --k8s: deployment manifests

---

## Sumário de Comandos Frequentes

```bash
# Inicializar workspace (uma vez)
npm run workspace:init

# Criar novo projeto (tudo automático)
npm run project:new meu-projeto

# Variantes
npm run project:new meu-projeto -- --skip-backend
npm run project:new meu-projeto -- --ai claude,copilot
npm run project:new meu-projeto -- --verbose

# Dentro do projeto
cd ~/forja-workspace/projects/meu-projeto

# Ver instruções para IA
cat .ia-instructions/copilot.md

# Ver contexto resumido
cat .context/context-pack.md | head -50

# Rodar backend
cd backend && npm run start:dev

# Sincronizar memória
cd backend && npm run memory:db:sync

# Criar handoff
node scripts/append-handoff.mjs orchestrator backend-nest "tarefa"

# Query contexto
cd backend && npm run memory:db:query -- "search" "auth" 10
```

---

## Help Rápido

```bash
node bin/init-project.js --help
```

---

**Criado**: 2026-04-21  
**Status**: 🟢 Pronto para Uso  
**Próximo**: Implementar em `bin/init-project.js` (já feito!)

