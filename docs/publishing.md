# 📦 Guia de Publicação no npm

Este documento explica exatamente o que será publicado e o que fica privado.

---

## ✅ O que SERÁ Publicado

Quando você rodar `npm publish --access public`, apenas isso será incluído:

```
create-memory-nest-kit/
│
├── bin/
│   ├── create-memory-nest-kit.js   ← Gerador original (sempre)
│   └── init-project.js             ← Novo: comando universal
│
├── Documentação
│   ├── README.md                    ← Atualizado (350+ linhas)
│   ├── START-HERE.md
│   ├── SUMARIO-EXECUTIVO.md
│   ├── REFINAMENTO-v1.0.md
│   ├── IMPLEMENTACAO-FASE1.md
│   ├── EXEMPLOS-CODIGO.md
│   ├── INDICE-MASTER.md
│   ├── INIT-PROJECT-GUIDE.md
│   ├── ESTRUTURA-PROJETO.md
│   ├── .github/copilot-instructions.md
│   └── .gemini-instructions.md
│
├── CLAUDE.md                        ← Instruções para Claude
├── LICENSE
├── package.json
├── .npmignore                       ← Controla exclusões
└── .gitignore

```

---

## ❌ O que NÃO Será Publicado

Estes diretórios e arquivos são **excluídos** pelo `.npmignore`:

```
❌ exemplo-projeto/      ← Exemplo v1 (referência local)
❌ exemplo-v2/          ← Exemplo v2 (referência local)
❌ exemplo-v3/          ← Exemplo v3 (referência local)
❌ teste-completo/      ← Projeto de teste
❌ teste-local/         ← Projeto de teste
❌ ai-medico/           ← Exemplo com caso real
❌ bpo-financeiro/      ← Exemplo com caso real
❌ test-init-demo/      ← Teste do comando
❌ .env                 ← Configuração local
❌ .env.local
❌ .env.*.local
❌ docs/                ← Documentação interna
❌ node_modules/        ← Dependências
❌ .DS_Store            ← macOS
❌ *.log                ← Logs
❌ *.tgz                ← Archives
```

---

## 🔍 Como Verificar

Antes de publicar, confirme o que será enviado:

```bash
# 1. Ver o que npm vai publicar
npm pack --dry-run

# 2. Listar arquivos
npm pack --dry-run | tar tzf -

# 3. Verificar .npmignore
cat .npmignore
```

---

## 📋 Checklist Pré-Publicação

Antes de `npm publish`:

### 1. Verificar Versão
```bash
cat package.json | grep version
# Esperado: "version": "0.3.0"
```

### 2. Build e Testes
```bash
npm run build        # Se houver
npm run test         # Se houver
npm run lint         # Se houver
```

### 3. Verificar .npmignore
```bash
# Deve excluir:
grep "exemplo-" .npmignore
grep "teste-" .npmignore
grep "\.env" .npmignore
```

### 4. Verificar Package.json
```json
{
  "name": "create-memory-nest-kit",
  "version": "0.3.0",
  "description": "Professional-grade scaffold for multi-agent orchestration",
  "main": "bin/create-memory-nest-kit.js",
  "bin": {
    "create-memory-nest-kit": "bin/create-memory-nest-kit.js",
    "init-project": "bin/init-project.js"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/seu-usuario/create-memory-nest-kit.git"
  },
  "keywords": [
    "scaffold",
    "multi-agent",
    "orchestration",
    "memory",
    "nestjs",
    "ai"
  ],
  "author": "Seu Nome",
  "license": "MIT"
}
```

### 5. Testar Comando Localmente
```bash
# Simular publicação
npm pack

# Resultado: create-memory-nest-kit-0.3.0.tgz

# Extrair e verificar
tar tzf create-memory-nest-kit-0.3.0.tgz | head -20

# Limpar
rm create-memory-nest-kit-0.3.0.tgz
```

---

## 🚀 Passos de Publicação

### Passo 1: Login no npm
```bash
npm login
```

Você será pedido para:
- Username
- Password
- Email (opcional)

### Passo 2: Publicar
```bash
npm publish --access public
```

Resultado esperado:
```
npm notice 📦 create-memory-nest-kit@0.3.0
npm notice === Tarball Contents ===
npm notice 500.0 kB  bin/create-memory-nest-kit.js
npm notice 400.0 kB  bin/init-project.js
npm notice 250.0 kB  README.md (+ 11 docs)
npm notice ...
npm notice === Dist Files ===
npm notice +publish create-memory-nest-kit@0.3.0
```

### Passo 3: Verificar Publicação
```bash
npm view create-memory-nest-kit@0.3.0
```

Deve mostrar:
- Nome
- Versão
- Descrição
- Keywords
- Repository URL

---

## 🧪 Testar Após Publicação

### Instalação via npm
```bash
# Limpar local
rm -rf test-npm-install

# Instalar do npm
npm install -g create-memory-nest-kit@0.3.0

# Testar
create-memory-nest-kit meu-projeto-novo
cd meu-projeto-novo
cat .ia-instructions/copilot.md
```

### Instalação via npx
```bash
npx create-memory-nest-kit@0.3.0 outro-projeto
cd outro-projeto
npm run build  # Se houver
```

---

## 📊 Tamanho do Pacote

Esperado (final):
- **Total**: ~1-2 MB (comprimido)
- **Descompactado**: ~3-5 MB
- **Sem exemplos**: ~500 KB (documentação + scripts)

Se ultrapassar 10MB, verificar:
```bash
npm pack
tar tzf *.tgz | wc -l  # Contar arquivos
du -sh *.tgz           # Tamanho
```

---

## 🔐 Privacidade

### Público (no npm)
- ✅ `bin/` - Scripts executáveis
- ✅ `*.md` - Documentação
- ✅ `package.json` - Metadados
- ✅ `.github/` - Instruções Copilot
- ✅ `LICENSE` - Licença

### Privado (não no npm)
- ❌ `exemplo-*` - Exemplos de output
- ❌ `teste-*` - Testes locais
- ❌ `.env` - Configuração sensível
- ❌ `docs/` - Documentação interna
- ❌ `node_modules/` - Dependências

---

## 🎯 Depois de Publicar

### 1. Atualizar GitHub
```bash
git tag v0.3.0
git push origin main --tags
git push origin main
```

### 2. Anunciar
```
Publicado: create-memory-nest-kit@0.3.0

✨ Novidades:
- bin/init-project.js comando universal
- 11 documentos profissionais (350+ KB)
- Suporte a Copilot, Claude, Gemini
- 38 melhorias especificadas
- Estrutura de memória hierárquica
- Multi-agent orchestration
- SQLite para rastreamento
- Enterprise-grade quality

Use:
  npx create-memory-nest-kit@0.3.0 meu-projeto
  node bin/init-project.js meu-projeto

https://npm.im/create-memory-nest-kit
```

### 3. GitHub Releases
Criar release em GitHub com:
- Changelog
- Download links
- Instruções de uso

---

## 🆘 Troubleshooting

### "Directory não encontrado"
```bash
# Verificar pasta
ls -la

# Executar de dentro da pasta
cd /home/apk/Documentos/GitHub/2-Projeto-Agents
npm publish --access public
```

### "npm ERR! 403 Forbidden"
```bash
# Verificar login
npm whoami

# Fazer login novamente
npm login
npm publish --access public
```

### "Tag já existe"
```bash
# Ver tags
git tag

# Usar versão diferente
# Atualizar package.json: version: 0.3.1
npm publish --access public
```

---

## 📝 Notas Importantes

1. **Sempre testar localmente antes**
   ```bash
   npm pack
   # Extrair e verificar conteúdo
   ```

2. **Manter .npmignore atualizado**
   Sempre que adicionar exemplo/teste, adicionar ao `.npmignore`

3. **Versioning semântico**
   - 0.3.0 → feature release (novo init-project.js)
   - 0.3.1 → bug fix
   - 1.0.0 → breaking changes

4. **Documentação no GitHub**
   Manter README.md sincronizado com npm

---

## 🎉 Depois Publicamente Disponível

Usuários podem:

```bash
# Via npx (sem instalar)
npx create-memory-nest-kit@latest meu-projeto

# Via npm global
npm install -g create-memory-nest-kit
create-memory-nest-kit meu-projeto

# Via npm local
npm install create-memory-nest-kit
npx create-memory-nest-kit meu-projeto
```

E automaticamente terão:
- ✅ Estrutura de memória completa
- ✅ Agentes orquestrados
- ✅ Backend NestJS
- ✅ Instruções para Copilot/Claude/Gemini
- ✅ SQLite indexação
- ✅ 38 melhorias implementadas

---

**Status**: 🟢 Pronto para Publicação  
**Versão**: 0.3.0  
**Data**: 2026-04-21

