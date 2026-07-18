# Quick Reference

**Atalhos & comandos essenciais.** Imprima ou bookmarque!

---

## Operacao CLI-First

```bash
npm run sprint:start
npm run sprint:status
npm run dev -- context:build task <slug> "<palavras-chave>"
npm run gsd:plan -- <slug> "<objetivo>"
npm run gsd:handoff -- spec <slug>
npm run gsd:handoff -- plan <slug>
npm run gsd:handoff -- implement <slug>
npm run gsd:handoff -- review <slug>
npm run gsd:check -- <slug>
npm run context:sprint
npm run agent:brief -- <role> <slug>
npm run context:budget -- .context/sprint-pack.md
npm run catalog:manifests
npm run catalog:assets
npm test
npm run project:check
```

Guia: `docs/cli-first-operacao.md`

---

## 📌 Gerador

```bash
# Preparar workspace (canto fixo dos projetos)
npm run workspace:init

# Novo projeto no workspace
npm run project:new meu-projeto

# Com flags
npm run project:new meu-projeto -- --ai claude,copilot
npm run project:new meu-projeto -- --skip-backend
npm run project:new meu-projeto -- --verbose

# Via binário direto (sempre cria no workspace)
node bin/init-project.js meu-projeto

# Ajuda
node bin/init-project.js --help
```

---

## 🐳 Backend (NestJS)

### Startup

```bash
cd backend

# Instalar deps
npm install

# Rodar em dev
npm run start:dev

# Rodar em prod
npm run build
npm run start:prod

# Parar: Ctrl+C
```

### Endpoints de Saúde

```bash
# Health check
curl http://localhost:3000/api/health

# Dashboard legado/opcional
npm run dashboard
```

---

## 🧪 Testes

```bash
# Rodar testes
npm test

# Watch mode
npm test:watch

# Coverage
npm run test:cov

# E2E
npm run test:e2e

# Teste específico
npm test -- auth.spec.ts
```

---

## 💅 Linting & Formatting

```bash
# Lint
npm run lint

# Fix
npm run lint -- --fix

# Format
npm run format
```

---

## 📚 Memória

### Gerar contexto

```bash
node scripts/build-context-pack.mjs
# Cria: .context/context-pack.md
```

### Inicializar SQLite

```bash
cd backend
npm run memory:db:init
# Cria: .memory/sqlite/context.db
```

### Sincronizar memória

```bash
cd backend
npm run memory:db:sync
# Atualiza índices do markdown
```

### Consultar

```bash
cd backend
npm run memory:db:query -- "auth"
# Busca "auth" em toda memória
```

### Watcher automático

```bash
node scripts/memory-watcher.mjs
# Sincroniza automaticamente ao salvar
```

---

## 🤝 Agentes

### Criar handoff

```bash
node scripts/append-handoff.mjs agente-a agente-b "Título"
# Cria: memory/50-orchestration/handoffs/[timestamp].md
```

### Ver handoffs recentes

```bash
ls -lt memory/50-orchestration/handoffs/ | head -10
```

### Limpar logs antigos

```bash
node scripts/memory-vacuum.mjs
# Move runs > 30 dias para archive/
```

---

## 📁 Estrutura (Leitura Rápida)

```
meu-projeto/
├─ backend/                    # API NestJS
│  ├─ src/
│  │  ├─ modules/             # Seus módulos
│  │  ├─ app.module.ts        # Registrar módulos aqui
│  │  └─ main.ts              # Entry point
│  └─ package.json            # Deps
├─ memory/                     # Documentação
│  ├─ 00-global/             # Missão, padrões
│  ├─ 10-product/            # Product
│  ├─ 20-architecture/       # Design
│  ├─ 30-domains/            # Seus domínios
│  ├─ 40-delivery/           # Roadmap, sprints
│  ├─ 50-orchestration/      # Topologia, handoffs
│  ├─ 60-runs/               # Logs de execução
│  ├─ 70-summaries/          # Resumos
│  ├─ 80-data/               # Schema DB
│  └─ 90-decisions/          # ADRs
├─ agents/                    # Definição de agentes
├─ skills/                    # Capacidades
├─ prompts/                   # Instruções
├─ .memory/sqlite/           # Índice SQLite
├─ AGENTS.md                 # Papéis
└─ DOC-MAP.md               # Você está aqui 👈
```

---

## 🎨 Criar Novo Módulo

```bash
# Gerar estrutura
nest g resource features/seu-modulo

# Manual:
# 1. mkdir -p src/features/seu-modulo
# 2. Criar: seu-modulo.module.ts
# 3. Criar: seu-modulo.controller.ts
# 4. Criar: seu-modulo.service.ts
# 5. Registrar em app.module.ts

# Importar em app.module.ts:
import { SeuModuloModule } from './features/seu-modulo/seu-modulo.module';

@Module({
  imports: [SeuModuloModule],  // ← Adicione aqui
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
```

---

## 🔐 Segurança Rápida

### Checklist pré-commit

```bash
# Lint (bloqueia erros)
npm run lint

# Tests (>80% coverage)
npm test

# Sem secrets?
grep -r "password\|api_key\|token" src/ --exclude="*.env*"

# Sem console.log?
grep -r "console\." src/

# Build OK?
npm run build
```

---

## 🚢 Deploy Rápido

### Vercel (Frontend) + Railway (Backend)

```bash
# 1. Commit tudo
git add .
git commit -m "Feature: auth"

# 2. Push
git push origin main

# 3. Vercel/Railway auto-deploya

# 4. Verificar
curl https://seu-projeto.railway.app/api/health
```

---

## 📊 Métricas Rápidas

```bash
# Linha de código
cloc backend/src/

# Complexidade ciclomática
npm install -g plato
plato -r -d backend/complexity backend/src/

# Dependências
npm audit

# Tamanho bundle
npm install -g webpack-bundle-analyzer
# (depois configurar no webpack)
```

---

## 🐛 Debug Rápido

### VS Code

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "NestJS",
      "program": "${workspaceFolder}/backend/node_modules/@nestjs/cli/bin/nest.js",
      "args": ["start", "--debug", "--watch"],
      "cwd": "${workspaceFolder}/backend"
    }
  ]
}
```

### Logs estruturados

```typescript
// logger.service.ts
import { Logger } from '@nestjs/common';

const logger = new Logger('AuthService');
logger.log('Login attempt', { user: email });  // Info
logger.warn('Rate limit', { ip });              // Aviso
logger.error('Auth failed', error);             // Erro
```

---

## 🔗 Links Rápidos

| Recurso | Link |
|---------|------|
| Documentation Map | [DOC-MAP.md](../DOC-MAP.md) |
| Getting Started | [README.md](../README.md) |
| Boilerplates | [boilerplates/](../boilerplates/README.md) |
| Architecture | [AGENTS.md](../AGENTS.md) |
| Personas | [personas/](personas/) |

---

## ⚡ One-Liners

```bash
# Quick start
node bin/init-project.js meu-app && cd meu-app/backend && npm i && npm run start:dev

# Test all
npm test && npm run test:e2e && npm run lint

# Clean build
rm -rf dist/ node_modules/ && npm i && npm run build

# Deploy checklist
npm run lint && npm test && npm run build

# Memory sync all
node scripts/build-context-pack.mjs && npm run memory:db:sync

# Find TODOs
grep -r "TODO\|FIXME" src/
```

---

## 🎯 Fluxo Típico (5 min setup)

```bash
# 1. Gerar (1 min)
node bin/init-project.js meu-app --force

# 2. Instalar (3 min)
cd meu-app/backend && npm i

# 3. Rodar (1 min)
npm run start:dev

# 4. Abrir em navegador
open http://localhost:3000/api/health
```

---

## 📞 Precisa de Ajuda?

| Dúvida | Arquivo |
|--------|---------|
| "Como começar?" | [README.md](../README.md) |
| "Como codificar?" | [boilerplates/](../boilerplates/README.md) |
| "Como arquitetar?" | [AGENTS.md](../AGENTS.md) |
| "Qual minha persona?" | [DOC-MAP.md](../DOC-MAP.md) |

---

**Imprime isso e coloca na parede! 📌**
