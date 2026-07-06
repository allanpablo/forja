# 🛠️ DEV WORKFLOW - Guia de Desenvolvimento Unificado

**Status:** Fase 4 - Desenvolvimento Ágil  
**Objetivo:** Unifcar CLI commands, pre-commit validation, health checks, e automatização

---

## 📋 Visão Geral

Esta fase cria uma interface unificada para todos os comandos de desenvolvimento, reduzindo complexidade e erros.

```
npm run dev -- <command> [args]
```

---

## 🎯 Comandos Disponíveis

### 1. `context:build` — Gerar Contexto Inteligente

**Uso:**
```bash
npm run dev -- context:build <mode> <project> [keyword]
```

**Modos:**
- `global` — Mission + standards + ADRs (~2KB, 500 tokens)
- `domain` — Vision + design + rules (~20KB, 5K tokens)
- `task` — Searchable context + domain (~30KB, 8K tokens)

**Exemplos:**
```bash
# Para novo dev (quick overview)
npm run dev -- context:build global my-project

# Para feature development
npm run dev -- context:build domain my-project

# Para debugging específico
npm run dev -- context:build task my-project "payment auth bug"
```

**Output:**
- Arquivo: `.context/context-{mode}.md`
- Metrics: bytes, tokens, estimated cost

---

### 2. `memory:vacuum` — Comprimir Memória

**Uso:**
```bash
npm run dev -- memory:vacuum
```

**O que faz:**
- Archive runs > 30 dias → `.memory/archive/`
- Remove índices vazios
- SQLite VACUUM otimizado

**Output:**
```
📦 Compression Report
  Before: 2.10 MB
  After:  1.20 MB
  Saved:  0.90 MB (43%)
  ✨ Database within limits
```

---

### 3. `memory:sync` — Sincronizar Índices

**Uso:**
```bash
npm run dev -- memory:sync [project]
```

**O que faz:**
- Rebuild FTS5 índices
- Atualiza search weights
- Limpa stale entries

---

### 4. `project:health` — Validação de Saúde

**Uso:**
```bash
npm run dev -- project:health
```

**Checa:**
- ✅ Estrutura de diretórios
- ✅ Arquivos de configuração
- ✅ Permissões
- ✅ Database status
- ✅ Dependencies

**Output:**
```
📁 Checking structure...
   ✅ lib/
   ✅ scripts/
   ✅ docs/
   ...

✅ Project health: GOOD
```

---

### 5. `project:init` — Inicializar Novo Projeto

**Uso:**
```bash
npm run dev -- project:init <project-name> [flags]
```

**Flags:**
- `--force` — Sobrescrever existente
- `--only-memory` — Apenas estrutura de memória
- `--no-gitkeep` — Sem .gitkeep em dirs vazios

**Exemplo:**
```bash
npm run dev -- project:init awesome-app
npm run dev -- project:init awesome-app --force
```

---

## 🔗 Pre-Commit Hook

**Instalação:**
```bash
cp scripts/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**Validações Automáticas:**
1. 🔐 Scan for secrets (password, api_key, token)
2. 🔍 Check console.log statements
3. 🧹 Lint & auto-fix staged files
4. 🧪 Run tests
5. 📄 Validate documentation

**Bypass (emergência):**
```bash
git commit --no-verify
```

---

## 🏥 Project Health Check

**Estrutura validada:**
```
✅ lib/                    (generators, validators, utils)
✅ scripts/                (CLI, build, compress)
✅ docs/                   (documentation)
✅ memory/                 (project knowledge)
✅ agents/                 (agent definitions)
✅ skills/                 (capabilities)
✅ prompts/                (instructions)
```

**Config validada:**
```
✅ .memoryrc.json          (token economy config)
✅ package.json            (dependencies, scripts)
✅ .gitignore              (security)
```

**Key files:**
```
✅ bin/create-memory-nest-kit.js    (generator orchestrator)
✅ lib/context-builder.js           (context API)
```

---

## 📅 Automatização Schedule

### Memory Vacuum Cron (Diário)

**Via Cron Job (Linux/Mac):**
```bash
# Edit crontab
crontab -e

# Add (roda 2h da manhã todo dia)
0 2 * * * cd /path/to/project && npm run dev -- memory:vacuum >> logs/cron.log 2>&1
```

**Via Windows Task Scheduler:**
```batch
# PowerShell
$action = New-ScheduledTaskAction -Execute "cmd.exe" `
  -Argument "/c cd C:\path\to\project && npm run dev -- memory:vacuum"
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
Register-ScheduledTask -TaskName "ProjectMemoryVacuum" -Action $action -Trigger $trigger
```

**Via PM2 (Recomendado):**
```bash
npm install -g pm2

# Criar ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'memory-vacuum',
    script: 'npm',
    args: 'run dev -- memory:vacuum',
    cron_restart: '0 2 * * *'  // 2h da manhã
  }]
};
EOF

pm2 start ecosystem.config.js
```

---

## 🚀 Workflow Típico

### Início de Dia

```bash
# 1. Verificar saúde do projeto
npm run dev -- project:health

# 2. Gerar contexto (se iniciando feature nova)
npm run dev -- context:build domain my-project
```

### Durante Desenvolvimento

```bash
# 1. Fazer alterações
vim src/features/auth.ts

# 2. Commit automático roda validações:
#    - Lint (auto-fix)
#    - Tests
#    - No secrets check
git commit -m "feat: auth implementation"
```

### Fim de Semana

```bash
# 1. Executar manually (ou via cron):
npm run dev -- memory:vacuum

# 2. Verificar novamente
npm run dev -- project:health
```

---

## 🔧 Configuração Customizada

### Via .memoryrc.json

```json
{
  "compression": {
    "archiveAge": 30,           // dias
    "maxDbSize": 50,            // MB
    "vacuumInterval": 86400000  // ms (1 dia)
  },
  "devWorkflow": {
    "preCommitStrict": true,
    "autofixOnCommit": true,
    "requireTests": true,
    "requireCoverage": 80
  }
}
```

### Via Environment Variables

```bash
# Skip tests
SKIP_TESTS=1 git commit -m "..."

# Dry run
DRY_RUN=1 npm run dev -- memory:vacuum

# Debug mode
DEBUG=1 npm run dev -- project:health
```

---

## 📊 Health Check Output Example

```
🏥 Running project health checks...

📁 Checking structure...
   ✅ lib/
   ✅ scripts/
   ✅ docs/
   ✅ memory/
   ✅ agents/
   ✅ skills/
   ✅ prompts/

⚙️  Checking config...
   ✅ .memoryrc.json
   ✅ package.json

📄 Checking key files...
   ✅ bin/create-memory-nest-kit.js
   ✅ lib/context-builder.js

🗄️  Checking database...
   ✅ ~/forja-workspace/memory/sqlite/universal.db

════════════════════════════════════════════════
✅ Project health: GOOD
════════════════════════════════════════════════
```

---

## ⚡ CLI Shortcuts

**Adicionar ao shell (`.bashrc` ou `.zshrc`):**

```bash
# Quick health check
alias dev-health='npm run dev -- project:health'

# Quick context
alias dev-ctx='npm run dev -- context:build'

# Quick vacuum
alias dev-vac='npm run dev -- memory:vacuum'

# Quick init
alias dev-init='npm run dev -- project:init'
```

**Uso:**
```bash
dev-health
dev-ctx task my-project "feature"
dev-vac
dev-init awesome-app
```

---

## 📋 Checklist Pre-Deployment

- [ ] `npm run dev -- project:health` ✅
- [ ] `npm run dev -- memory:vacuum` ✅
- [ ] All tests passing: `npm test`
- [ ] Coverage > 80%: `npm run test:cov`
- [ ] No console.log in production code
- [ ] Docs updated: `git diff --name-only | grep .md`
- [ ] Commit message follows convention: `feat:` / `fix:` / `docs:`
- [ ] Pre-commit hook passed automatically

---

## 🐛 Troubleshooting

### Pre-commit hook não roda

```bash
# Verificar permissões
ls -la .git/hooks/pre-commit

# Se não tem permissão:
chmod +x .git/hooks/pre-commit
```

### Health check falha

```bash
# Rodar com debug
DEBUG=1 npm run dev -- project:health

# Checar diretório específico
ls -la lib/
ls -la scripts/
```

### Memory vacuum muito lento

```bash
# Checar tamanho do DB
du -sh .memory/sqlite/context.db

# Manual cleanup (backup first!)
cp .memory/sqlite/context.db .memory/sqlite/context.db.backup
sqlite3 .memory/sqlite/context.db "VACUUM;"
```

---

## 🔗 Referência Rápida

| Comando | Uso | Output |
|---------|-----|--------|
| `context:build` | Gerar contexto | `.context/context-*.md` |
| `memory:vacuum` | Comprimir | Relatório de economia |
| `memory:sync` | Atualizar índices | Status de sync |
| `project:health` | Validar projeto | Relatório de saúde |
| `project:init` | Novo projeto | Projeto inicializado |

---

**Próxima Fase**: Testes de integração com projeto exemplo  
**Status**: Fase 4 - CLI Unificada 100% ✅
