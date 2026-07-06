# 🚀 Referência Rápida

**Suas respostas em 30 segundos**

---

## ❓ Perguntas Comuns

### "Por onde começo?"
```bash
cat README.md          # 5 min - visão geral
cat START-HERE.md      # 2 min - quick start
```

### "Como criar um novo projeto?"
```bash
node bin/init-project.js meu-projeto
cd meu-projeto
npm run start:dev      # opcional
```

### "Qual é a estrutura?"
```bash
cat ESTRUTURA-PROJETO.md
```

### "Como usar com Copilot?"
```bash
node bin/init-project.js meu-projeto
cat meu-projeto/.ia-instructions/copilot.md
```

### "Como usar com Claude?"
```bash
node bin/init-project.js meu-projeto
cat meu-projeto/.ia-instructions/claude.md
```

### "Como usar com Gemini?"
```bash
node bin/init-project.js meu-projeto
cat meu-projeto/.ia-instructions/gemini.md
```

### "Como usar com Codex (OpenAI)?"
```bash
node bin/init-project.js meu-projeto
cat meu-projeto/.ia-instructions/codex.md
```

### "Quero ver exemplos de código"
```bash
cat EXEMPLOS-CODIGO.md
```

### "Qual é a especificação completa?"
```bash
cat REFINAMENTO-v1.0.md
```

### "Como publicar no npm?"
```bash
cat PUBLICACAO.md
npm publish --access public
```

### "Quero implementar uma melhoria"
```bash
cat IMPLEMENTACAO-FASE1.md
```

### "Como rastrear progresso?"
```bash
cat DASHBOARD-PROGRESSO.md
```

---

## 📋 Bandeiras (Flags)

```bash
# Setup completo
node bin/init-project.js meu-projeto

# Apenas memória (sem NestJS)
node bin/init-project.js meu-projeto --skip-backend

# Sem banco de dados
node bin/init-project.js meu-projeto --skip-db

# Sem git init
node bin/init-project.js meu-projeto --skip-git

# Com output detalhado
node bin/init-project.js meu-projeto --verbose

# Escolher IAs (copilot, claude, gemini)
node bin/init-project.js meu-projeto --ai copilot,claude
```

---

## 📂 Estrutura Gerada

```
meu-projeto/
├── memory/          ← Hierarquia de conhecimento (10 níveis)
├── agents/          ← Especificação de agentes
├── skills/          ← Skills operacionais
├── prompts/         ← Templates de prompts
├── scripts/         ← Automação (context pack, handoff)
├── .ia-instructions/ ← Instruções para Copilot/Claude/Gemini
├── backend/         ← NestJS API (se não --skip-backend)
├── .memoryrc.json   ← Config de memória
└── README.md        ← Documentação local
```

---

## 🎯 3 Minutos de Setup

```bash
# 1. Criar projeto (30 seg)
node bin/init-project.js demo

# 2. Explorar estrutura (30 seg)
cd demo
ls -la

# 3. Ver instruções para IA (60 seg)
cat .ia-instructions/copilot.md
# Ou claude.md ou gemini.md

# 4. Começar trabalho (1 min)
cat memory/00-global/contrato-agentes.md
```

---

## 📚 Documentação por Papel (5 min cada)

| Papel | Leia | Depois |
|-------|------|--------|
| **PM/Executivo** | README.md + SUMARIO-EXECUTIVO.md | DASHBOARD-PROGRESSO.md |
| **Arquiteto** | ESTRUTURA-PROJETO.md + REFINAMENTO-v1.0.md | Validate decisions |
| **Dev** | START-HERE.md + EXEMPLOS-CODIGO.md | Begin implementation |
| **QA** | DASHBOARD-PROGRESSO.md + CHECKLIST-FINAL.md | Run validations |
| **DevOps** | PUBLICACAO.md | npm publish |

---

## 🔧 Comandos Principais

```bash
# Criar projeto
node bin/init-project.js meu-projeto

# Compactar contexto (dentro do projeto)
node scripts/build-context-pack.mjs

# Limpar memória antiga (Vacuum)
node scripts/memory-vacuum.mjs

# Observar mudanças e auto-sync
cd backend && npm run memory:watch

# Criar handoff (dentro do projeto)
node scripts/append-handoff.mjs

# Sincronizar BD (dentro do projeto)
node backend/scripts/memory-db-sync.mjs

# Consultar BD (dentro do projeto)
node backend/scripts/memory-db-query.mjs --table improvement_items

# Publicar no npm (do kit root)
npm publish --access public

# Testar publicação
npm pack --dry-run
```

---

## 🤖 Trabalho com IAs

### Para Copilot (VSCode)
1. Abra pasta do projeto
2. Copilot carrega automaticamente `.ia-instructions/copilot.md`
3. Coloque no chat: `@codebase help <pergunta>`

### Para Claude (claude.ai)
1. Cole em novo chat: conteúdo de `meu-projeto/.ia-instructions/claude.md`
2. Cole depois: seu contexto de trabalho
3. Faça perguntas

### Para Gemini (gemini.ai)
1. Cole em novo chat: conteúdo de `meu-projeto/.ia-instructions/gemini.md`
2. Depois proceda normalmente

### Para Codex (OpenAI API)
1. Cole em novo chat: conteúdo de `meu-projeto/.ia-instructions/codex.md`
2. Use para geração de código
3. Respeite model-specific token limits

---

## 📊 Estatísticas

| Item | Valor |
|------|-------|
| Documentação | 13 arquivos |
| Linhas de código | 400+ (scripts) |
| Melhorias especificadas | 38 |
| Áreas de qualidade | 8 |
| IAs suportadas | 4 (Copilot, Claude, Gemini, Codex) |
| Snippets prontos | 15+ |
| Tempo para setup | 1 min |
| Tempo para ler tudo | 2-3 horas |

---

## ✅ Checklist de Setup

- [ ] Executar `node bin/init-project.js demo`
- [ ] Explorar `meu-projeto/memory/`
- [ ] Ler `.ia-instructions/copilot.md` (ou outro)
- [ ] Testar `node scripts/build-context-pack.mjs`
- [ ] Ler `ESTRUTURA-PROJETO.md`
- [ ] Entender 38 melhorias em `REFINAMENTO-v1.0.md`
- [ ] Pronto para começar!

---

## 🆘 Problemas?

### Init não funciona
```bash
cd /home/apk/Documentos/GitHub/2-Projeto-Agents
node bin/init-project.js demo
```

### Instruções de IA não aparecem
```bash
ls -la demo/.ia-instructions/
# Devem ter: copilot.md, claude.md, gemini.md
```

### Banda muito larga
```bash
# Usar --skip-backend para setup rápido
node bin/init-project.js demo --skip-backend
```

### Não consegue publicar npm
```bash
# Verificar login
npm whoami

# Login novamente
npm login

# Depois publicar
npm publish --access public
```

---

## 📞 Links Rápidos

| Arquivo | Descrição |
|---------|-----------|
| README.md | Documentação principal |
| START-HERE.md | Quick start |
| ESTRUTURA-PROJETO.md | Visual da estrutura |
| EXEMPLOS-CODIGO.md | Snippets prontos |
| REFINAMENTO-v1.0.md | Especificação 38 items |
| PUBLICACAO.md | Guia npm publish |
| INDICE-MASTER.md | Índice de documentação |
| CLAUDE.md | Instrução Claude |
| .openai-instructions.md | Instrução Codex |

---

## 🎯 Fluxo Básico (5 min)

```
1. Criar projeto
   node bin/init-project.js meu-projeto

2. Carregar em IA (Copilot/Claude/Gemini/Codex)
   cat meu-projeto/.ia-instructions/[copilot|claude|gemini|codex].md

3. Decompor tarefa
   cat memory/50-orchestration/topologia.md

4. Executar
   Agentes trabalham em paralelo

5. Criar handoff
   node scripts/append-handoff.mjs

6. Reviewer valida
   cat memory/50-orchestration/handoffs/

7. Atualizar memória
   node backend/scripts/memory-db-sync.mjs
```

---

## 💡 Dicas

1. **Sempre começar com** `README.md` e `START-HERE.md`
2. **Ler** `ESTRUTURA-PROJETO.md` antes de usar
3. **Testar localmente** antes de publicar
4. **Manter** `.npmignore` atualizado
5. **Usar** `--skip-backend` para testes rápidos

---

**Versão**: 0.3.0  
**Status**: 🟢 Production-Ready  
**Última Atualização**: 2026-04-21
