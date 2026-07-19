/**
 * README Generator - Gera README.md para novo projeto
 */

import path from 'node:path';
import { writeFileSafe } from '../utils/file-helpers.ts';

/**
 * Factory para README dinâmico
 */
function createReadmeContent(projectName: any) {
  return `# ${projectName}

Scaffold gerado por **create-memory-nest-kit v0.5.0**

## 🎯 Estrutura

Este projeto segue uma arquitetura modular com:

- **memory/** — Hierarquia de documentação centralizada
  - 00-global/ — Missão, padrões, contexto
  - 10-product/ — Visão, personas, regras
  - 20-architecture/ — Design do sistema
  - 30-domains/ — Bounded contexts (auth, billing, etc)
  - 40-delivery/ — Roadmap e sprints
  - 50-orchestration/ — Topologia de agentes, handoffs
  - 60-runs/ — Log de execução
  - 70-summaries/ — Resumos compactados
  - 80-data/ — Schema e queries
  - 90-decisions/ — ADRs

- **agents/** — Definição de agentes especializados
- **skills/** — Capacidades reutilizáveis
- **prompts/** — Instruções por contexto
- **backend/** — API NestJS (se gerado)

## 🚀 Quick Start

### 1. Explorar a Memória

\`\`\`bash
# Ler a missão do projeto
cat memory/00-global/mission.md

# Ler padrões globais
cat memory/00-global/standards.md

# Ler arquitetura
cat memory/20-architecture/system-overview.md
\`\`\`

### 2. Construir Contexto

\`\`\`bash
# Gerar um context pack com os arquivos prioritários
node scripts/build-context-pack.mjs

# Arquivo gerado em .context/context-pack.md
\`\`\`

### 3. Executar Backend (opcional)

\`\`\`bash
cd backend

# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run start:dev

# Executar testes
npm test

# Verificar saúde da API
curl http://localhost:3000/api/health
\`\`\`

## 📝 Fluxo de Trabalho Multiagente

### Orquestrador
- Recebe tarefa
- Decompõe em subtarefas independentes
- Atribui ownership por arquivo

### Workers
- Executam subtarefas isoladas
- Entregam: alterações, testes, riscos
- Registram handoff em memory/50-orchestration/handoffs/

### Reviewer
- Valida qualidade, segurança, cobertura
- Aprova ou rejeita

### Consolidação
- Integrar handoffs
- Atualizar resumos em memory/70-summaries/

## 🔄 Protocolo de Handoff

Cada handoff deve incluir:

- **Contexto**: O que foi feito e por quê?
- **Alterações**: Lista de arquivos modificados
- **Riscos**: Potenciais problemas ou edge cases
- **Pendências**: O que não foi concluído
- **Próximo Passo**: Quem assume e o quê fazer

Exemplo:
\`\`\`bash
node ../scripts/append-handoff.mjs agente-a agente-b "Título da entrega"
\`\`\`

## 🗄️ Banco de Dados (SQLite)

A estrutura de memória é indexada em SQLite para busca rápida:

\`\`\`bash
# Inicializar banco
cd backend && npm run memory:db:init

# Sincronizar com markdown
npm run memory:db:sync

# Consultar por termo
npm run memory:db:query -- "auth"
\`\`\`

## 📊 Dashboard Operacional

Após iniciar o backend:

\`\`\`bash
# Abrir em navegador
open http://localhost:3000/ops
\`\`\`

Mostra:
- Status dos agentes
- Progresso de tarefas
- Últimos handoffs

## 🛠️ Scripts Utilitários

| Script | O que faz |
|--------|-----------|
| \`build-context-pack.mjs\` | Monta pack de contexto prioritário |
| \`append-handoff.mjs\` | Cria novo arquivo de handoff |
| \`memory-vacuum.mjs\` | Arquiva logs > 30 dias |
| \`memory-watcher.mjs\` | Auto-sync de markdown → SQLite |

## 📚 Documentação Importante

- **memory/00-global/context-policy.md** — Política de janelas de contexto
- **memory/00-global/agent-contract.md** — Contrato entre agentes
- **memory/50-orchestration/handoff-protocol.md** — Protocolo formal de handoff
- **prompts/project-prompt-base.md** — Instruções base para agentes
- **AGENTS.md** — Definição de papéis e responsabilidades

## 🎯 Próximos Passos

1. ✅ Preencher memory/10-product/vision.md
2. ✅ Preencher memory/20-architecture/* com detalhes do seu sistema
3. ✅ Criar ADRs em memory/90-decisions/
4. ✅ Adicionar domínios em memory/30-domains/
5. ✅ Kickoff do primeiro sprint
6. ✅ Registrar primeiros handoffs

## 🤝 Contribuindo

### Padrões
- Documentação em **pt-BR**
- Decisões explícitas em ADR
- Toda mudança registra impacto e rollback

### Validação
\`\`\`bash
# Verificar integridade de estrutura
npm run project:check

# Gerar dashboard de progresso
npm run project:dashboard
\`\`\`

---

**Gerado em**: ${new Date().toISOString()}

**Versão**: v0.5.0

`;
}

/**
 * Escreve README.md para o projeto
 * @param {string} baseDir - Diretório base
 * @param {string} projectName - Nome do projeto
 * @param {Object} options - Opções (force)
 */
export function generateReadme(baseDir: any, projectName: any, options = {}) {
  const content = createReadmeContent(projectName);
  writeFileSafe(path.join(baseDir, 'README.md'), content, options);

  return {
    success: true,
    path: path.join(baseDir, 'README.md'),
    size: content.length,
  };
}

export default {
  generateReadme,
};
