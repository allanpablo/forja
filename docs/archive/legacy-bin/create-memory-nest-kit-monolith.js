#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp) {
  console.log(`
create-memory-nest-kit v0.5.0

Uso:
  create-memory-nest-kit [diretorio] [opcoes]

Opcoes:
  --force         Sobrescreve arquivos existentes
  --only-memory   Gera apenas estrutura de memoria/agents/skills
  --no-gitkeep    Nao cria .gitkeep em diretorios vazios
  -h, --help      Mostra esta ajuda
`);
  process.exit(0);
}

const options = {
  force: args.includes('--force'),
  noGitkeep: args.includes('--no-gitkeep'),
  onlyMemory: args.includes('--only-memory')
};

const rawTarget = args.find((a) => !a.startsWith('-')) || '.';
const targetDir = path.resolve(process.cwd(), rawTarget);
const projectName = path.basename(targetDir);

function log(message) {
  console.log(message);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFileSafe(filePath, content) {
  if (fs.existsSync(filePath) && !options.force) {
    throw new Error(`Arquivo ja existe: ${filePath}. Use --force para sobrescrever.`);
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function maybeGitkeep(dirPath) {
  if (options.noGitkeep) return;
  const keepFile = path.join(dirPath, '.gitkeep');
  if (!fs.existsSync(keepFile)) {
    fs.writeFileSync(keepFile, '', 'utf8');
  }
}

function writeMemoryAndOps(base) {
  const files = {
    'memory/README.md': `# Memoria do Projeto

Esta estrutura foi desenhada para reduzir perda de contexto em projetos grandes.

## Principio
- Nao depender de um unico contexto gigante.
- Trabalhar com memoria em camadas + handoff incremental.
- Registrar decisoes, resumos e execucoes para continuidade.
`,

    'memory/00-global/mission.md': `# Missao do Projeto

Construir software com clareza arquitetural, seguranca by-default e entrega continua.

## Principios
- Simplicidade primeiro
- Decisoes explicitas em ADR
- Qualidade e seguranca desde o inicio
- Documentacao viva
`,

    'memory/00-global/standards.md': `# Padroes Globais

## Idioma
- Toda comunicacao e documentacao em **pt-BR**.

## Backend
- API criada em **NestJS** por padrao.
- Arquitetura modular por dominio.

## Qualidade
- Cada mudanca deve registrar impacto, risco e rollback.
- Priorizar padroes reutilizaveis.
`,

    'memory/00-global/context-policy.md': `# Politica de Contexto Longo

## Objetivo
Permitir trabalho em larga escala sem depender de janela unica gigantesca.

## Regras
- Usar contexto em camadas: global -> dominio -> tarefa -> diff.
- Antes de cada tarefa: carregar apenas arquivos necessarios.
- A cada entrega: gerar resumo curto em memory/70-summaries.
- Em mudancas grandes: registrar handoff em memory/50-orchestration/handoffs.

## 🔄 Protocolo de Recuperacao (Engine Switch)
Se houver esgotamento de cota ou necessidade de mudar de IA:
1. Localize o arquivo \`.ia-instructions/models.json\`.
2. Identifique o proximo motor na \`fallback_chain\`.
3. Carregue as instrucoes do novo motor.
4. Forneca o conteúdo de \`.context/context-pack.md\` + o ultimo arquivo em \`memory/50-orchestration/handoffs/\`.
5. O novo motor assumira o trabalho a partir do ponto exato da ultima entrega.

## Nota importante
Esta estrutura **nao aumenta** limite nativo do modelo.
Ela reduz perda de memoria por segmentacao, resumo e continuidade operacional.
`,

    'memory/00-global/agent-contract.md': `# Contrato de Agentes

## Orquestrador
- Decompõe trabalho em subtarefas independentes.
- Define dono por escopo de arquivo.
- Consolida handoffs e conflitos.

## Workers
- Implementam subtarefas com escopo claro.
- Nao alteram areas de outros agentes sem alinhamento.
- Entregam: alteracoes, riscos, testes e pendencias.

## Reviewer
- Verifica regressao, seguranca e cobertura de testes.
- Bloqueia merge se encontrar risco critico.
`,

    'memory/00-global/context-index.md': `# Indice de Contexto

## Ordem de Leitura
1. memory/00-global/mission.md
2. memory/00-global/standards.md
3. memory/00-global/context-policy.md
4. memory/10-product/*
5. memory/20-architecture/*
6. memory/30-domains/<dominio>/*
7. memory/40-delivery/current-sprint.md
8. memory/90-decisions/ADR-*.md
9. memory/70-summaries/*
`,

    'memory/10-product/vision.md': `# Visao de Produto

Descreva objetivo, publico-alvo, problema e proposta de valor.
`,

    'memory/10-product/personas.md': `# Personas

Liste personas e dores principais.
`,

    'memory/10-product/business-rules.md': `# Regras de Negocio

Documente regras imutaveis e validacoes criticas.
`,

    'memory/10-product/nfrs.md': `# Requisitos Nao Funcionais

- Performance
- Seguranca
- Observabilidade
- Escalabilidade
`,

    'memory/20-architecture/system-overview.md': `# Visao Geral da Arquitetura

Descreva contexto, fronteiras e integracoes principais.
`,

    'memory/20-architecture/frontend.md': `# Frontend

Defina padroes de componentizacao, acessibilidade e performance.
`,

    'memory/20-architecture/backend.md': `# Backend

## Diretriz principal
- Backend em **NestJS** por padrao.

## Estrutura sugerida
- Modulos por dominio
- DTO + validacao
- Servicos com regras de negocio
- Repositorios/integradores isolados
`,

    'memory/20-architecture/data.md': `# Dados

Descreva entidades, relacionamentos e politicas de retencao.
`,

    'memory/20-architecture/security.md': `# Seguranca

- Principio do menor privilegio
- Segredos fora do codigo
- Validacao de entrada em todas as rotas
- Logs sem dados sensiveis
`,

    'memory/20-architecture/observability.md': `# Observabilidade

- Logs estruturados
- Metricas e tracing
- Alertas por SLO
`,

    'memory/30-domains/auth/context.md': `# Contexto de Auth

Defina escopo funcional de autenticacao/autorizacao.
`,

    'memory/30-domains/auth/rules.md': `# Regras de Auth

Liste regras e restricoes de seguranca.
`,

    'memory/30-domains/auth/api.md': `# API de Auth

Documente endpoints, payloads e erros.
`,

    'memory/30-domains/billing/context.md': `# Contexto de Billing

Defina cobranca, ciclo e integracoes.
`,

    'memory/30-domains/billing/rules.md': `# Regras de Billing

Descreva calculos, status e excecoes.
`,

    'memory/30-domains/billing/api.md': `# API de Billing

Documente endpoints e regras de idempotencia.
`,

    'memory/40-delivery/roadmap.md': `# Roadmap

Mapeie entregas por trimestre/sprint.
`,

    'memory/40-delivery/current-sprint.md': `# Sprint Atual

## Objetivos
-

## Itens
-

## Riscos
-
`,

    'memory/40-delivery/backlog.md': `# Backlog

Liste itens priorizados com contexto minimo.
`,

    'memory/50-orchestration/topology.md': `# Topologia Multiagente

## Papeis
- Orquestrador
- Worker Backend (NestJS)
- Worker Frontend
- Worker DBA
- Worker Security
- Reviewer

## Fluxo
1. Orquestrador cria plano e fatia trabalho.
2. Workers executam em paralelo com escopo isolado.
3. Handoffs sao registrados.
4. Reviewer valida e aprova.
`,

    'memory/50-orchestration/routing.md': `# Roteamento de Tarefas

## Regras de roteamento
- API e dominio server-side -> backend-nest
- Schema/migracao/query -> dba
- Auth, hardening, segredos -> security
- UX/componentes -> frontend

## Critico
Subtarefas devem ter dono unico por arquivo para evitar conflito.
`,

    'memory/50-orchestration/handoff-protocol.md': `# Protocolo de Handoff

Cada handoff deve conter:
- contexto minimo
- alteracoes realizadas
- arquivos tocados
- riscos e pontos abertos
- proximos passos objetivos
`,

    'memory/50-orchestration/parallel-playbook.md': `# Playbook de Paralelizacao

## Quando paralelizar
- Subtarefas independentes por dominio.
- Escopo de escrita sem sobreposicao.

## Quando nao paralelizar
- Mudanca bloqueante para a proxima etapa.
- Refactor altamente acoplado no mesmo modulo.
`,

    'memory/50-orchestration/handoffs/README.md': `# Handoffs

Registre cada transicao em arquivos markdown com timestamp.
Exemplo: 2026-04-18T12-30_worker-backend_para_reviewer.md
`,

    'memory/60-runs/README.md': `# Runs

Log de execucao por ciclo/sprint.
`,

    'memory/70-summaries/global-summary.md': `# Resumo Global

Atualize a cada marco importante com:
- estado atual
- decisoes novas
- riscos ativos
`,

    'memory/70-summaries/domain-summary.md': `# Resumo por Dominio

Mantenha resumos curtos por dominio para carregamento rapido de contexto.
`,

    'memory/80-data/memory-db.md': `# Memory DB (SQLite)

## Objetivo
Armazenar indice operacional da documentacao para busca e continuidade de contexto.

## Fonte da verdade
- Arquivos Markdown em memory/, docs/, agents/, skills/, prompts/

## Banco
- SQLite em .memory/sqlite/context.db

## Fluxo
1. Atualizar markdown
2. Rodar sincronizacao
3. Consultar contexto por texto ou tipo
`,

    'memory/90-decisions/ADR-0001-template.md': `# ADR-0001: Titulo da Decisao

## Contexto

## Decisao

## Consequencias

## Alternativas consideradas
`,

    'agents/README.md': `# Agents

Agentes especializados para dividir trabalho em paralelo.
`,

    'agents/orchestrator.md': `# Agent: Orchestrator

## Responsabilidade
Planejamento, decomposicao de tarefas, atribuicao de ownership e consolidacao.

## Entrega minima
- plano objetivo
- distribuicao por agentes
- consolidacao de handoffs
`,

    'agents/backend-nest.md': `# Agent: Backend NestJS

## Escopo
- modulos, controllers, services, dto, guard, pipe
- testes unitarios e e2e da API

## Padrao
- NestJS por padrao
- validacao de entrada obrigatoria
`,

    'agents/frontend.md': `# Agent: Frontend

## Escopo
- componentes, acessibilidade, performance, UX
`,

    'agents/dba.md': `# Agent: DBA

## Escopo
- modelagem, indices, migracoes, tuning de query
`,

    'agents/security.md': `# Agent: Security

## Escopo
- threat modeling, hardening, authz/authn, secrets, auditoria
`,

    'agents/reviewer.md': `# Agent: Reviewer

## Escopo
- regressao funcional
- riscos de seguranca
- cobertura de testes
`,

    'skills/triage-task/SKILL.md': `# Skill: Triage de Tarefa

## Objetivo
Classificar demanda em: rapido, medio, complexo.

## Saida
- resumo
- risco
- owner sugerido
- fatias de execucao
`,

    'skills/context-compaction/SKILL.md': `# Skill: Compactacao de Contexto

## Objetivo
Gerar resumo operacional sem perder decisoes chave.

## Regras
- manter fatos verificaveis
- remover redundancia
- preservar links para fontes internas
`,

    'skills/handoff/SKILL.md': `# Skill: Handoff

## Template
- contexto
- alteracoes
- riscos
- pendencias
- proximo agente
`,

    'skills/nest-api/SKILL.md': `# Skill: Nest API

## Checklist
- modulo criado
- dto com validacao
- controller + service
- testes
`,

    'skills/self-healing/SKILL.md': `# Skill: Auto-Diagnóstico (Self-Healing)

## Objetivo
Resolver falhas de build, testes ou tipos sem intervenção humana.

## Fluxo
1. Analisar a stack trace completa do erro.
2. Identificar se é: erro de sintaxe, falta de dependência, erro de tipo ou lógica.
3. Consultar documentação interna ou padrões do projeto.
4. Propor correção mínima e rodar validação novamente.
`,

    'skills/validate-handoff/SKILL.md': `# Skill: Validação e Review de Segurança (Gatekeeper)

## Objetivo
Atuar como Gatekeeper final para garantir que nenhum código inseguro ou incompleto entre no pipeline.

## Protocolo de Review (Obrigatório)
Antes de aceitar um handoff, o Reviewer deve validar:

1. **Compliance de Raciocínio**: O Worker preencheu o bloco \`## Raciocínio Estruturado\`? (Se não, rejeite imediatamente).
2. **Scan de Segurança**:
   - Há logs sensíveis (PII, tokens) sendo impressos?
   - As validações de input estão no DTO?
3. **Verificação de Handoff**: 
   - Os arquivos listados no handoff condizem com o diff real?
   - Existem pendências (riscos) não documentadas?

## Saída do Reviewer
- [ ] Aprovado (Status: \`done\` no DB)
- [ ] Rejeitado (Status: \`blocked\` + pendências listadas)
`,

    'skills/ui-fidelity/SKILL.md': `# Skill: Fidelidade Visual

## Objetivo
Garantir que a UI segue padrões de elite.

## Instrução
1. Consultar a biblioteca \`design-md/\` para inspiração de marca/padrão.
2. Comparar o código gerado com os padrões de espaçamento, tipografia e cores da referência.
3. Ajustar CSS/Componentes para atingir qualidade visual de nível mundial.
`,

    'skills/reasoning-protocol/SKILL.md': `# Skill: Raciocínio Estruturado (Chain-of-Thought)

## Objetivo
Reduzir erros de implementação através de análise lógica explícita.

## Protocolo Obrigatório
Antes de qualquer código ou plano de ação, preencha o bloco \`## Raciocínio Estruturado\`:

1. **Entendimento**: O que foi pedido e qual o impacto no sistema?
2. **Restrições**: Quais arquivos NÃO posso tocar? Quais padrões devo seguir?
3. **Alternativas**: Existe mais de uma forma de fazer? Por que escolhi esta?
4. **Plano de Ataque**: Passo-a-passo lógico da implementação.
`,

    'skills/MANIFEST.json': `{
  "version": "0.5.0",
  "skills": [
    { "id": "triage", "path": "skills/triage-task/SKILL.md", "description": "Classificação de tarefas" },
    { "id": "compaction", "path": "skills/context-compaction/SKILL.md", "description": "Compactação de memória" },
    { "id": "handoff", "path": "skills/handoff/SKILL.md", "description": "Protocolo de transição" },
    { "id": "nest-api", "path": "skills/nest-api/SKILL.md", "description": "Geração de endpoints NestJS" },
    { "id": "self-healing", "path": "skills/self-healing/SKILL.md", "description": "Resolução autônoma de erros" },
    { "id": "validate-handoff", "path": "skills/validate-handoff/SKILL.md", "description": "Checklist de qualidade de handoff" },
    { "id": "ui-fidelity", "path": "skills/ui-fidelity/SKILL.md", "description": "Auditoria estética de UI" },
    { "id": "reasoning", "path": "skills/reasoning-protocol/SKILL.md", "description": "Protocolo de raciocínio lógico" }
  ]
}
`,

    'prompts/project-prompt-base.md': `# Prompt Base do Projeto

Voce e um agente de engenharia sênior neste repositorio.

Prioridade de contexto:
1. memory/00-global/mission.md
2. memory/00-global/standards.md
3. memory/00-global/context-policy.md
4. memory/10-product/*
5. memory/20-architecture/*
6. memory/30-domains/<dominio>/*
7. memory/40-delivery/current-sprint.md
8. memory/90-decisions/ADR-*.md
9. memory/70-summaries/*

Regras:
- comunicacao em pt-BR
- API em NestJS por padrao
- nao contradizer ADR sem sinalizar
- explicitar suposicoes
- **OBRIGATÓRIO**: Usar a skill \`reasoning\` e preencher o bloco \`## Raciocínio Estruturado\` antes de cada resposta técnica.
- entregar: raciocínio, entendimento, plano, implementacao, validacao e proximos passos
`,

    'prompts/multi-agent-orchestrator.md': `# Prompt Orquestrador Multiagente

Atue como orquestrador. Divida o trabalho em subtarefas independentes, com ownership por arquivo.

Para cada subtarefa, entregue:
- objetivo
- escopo de escrita
- criterio de pronto
- risco principal
- agente dono

No final, consolide os handoffs em ordem cronologica.
`,

    'prompts/worker-task-template.md': `# Prompt Worker

Voce recebeu uma subtarefa.

Responda com:
1. **Raciocínio Estruturado** (Uso obrigatório da skill \`reasoning\`)
2. Entendimento
3. Implementacao realizada
4. Arquivos alterados
5. Validacao/testes
6. Riscos e pendencias
`,

    'AGENTS.md': `# AGENTS

## Linguagem
- Sempre responder e documentar em **pt-BR**.

## Stack
- API padrao do projeto: **NestJS**.

## Modo multiagente
- Orquestrador decompõe tarefas
- Workers executam em paralelo por ownership
- Reviewer valida riscos

## Memoria
- Seguir hierarchy em /memory
- Registrar handoff e resumo ao fim de cada entrega relevante
`,

    '.memoryrc.json': `{
  "strategy": "hierarchical",
  "maxContextHint": "1M+ por segmentacao e resumo incremental",
  "handoffDir": "memory/50-orchestration/handoffs",
  "summaryDir": "memory/70-summaries",
  "sqlitePath": ".memory/sqlite/context.db",
  "language": "pt-BR",
  "backendDefault": "nestjs"
}
`,

    'scripts/build-context-pack.mjs': `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.context');
const outFile = path.join(outputDir, 'context-pack.md');

const priorityFiles = [
  'memory/00-global/mission.md',
  'memory/00-global/standards.md',
  'memory/00-global/context-policy.md',
  'memory/20-architecture/backend.md',
  'memory/40-delivery/current-sprint.md',
  'memory/70-summaries/global-summary.md'
];

fs.mkdirSync(outputDir, { recursive: true });
let content = '# Context Pack\\n\\n';

for (const rel of priorityFiles) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  const raw = fs.readFileSync(abs, 'utf8').slice(0, 6000);
  content += '## ' + rel + '\\n\\n' + raw + '\\n\\n';
}

fs.writeFileSync(outFile, content, 'utf8');
console.log('Context pack gerado em: ' + outFile);
`,

    'scripts/append-handoff.mjs': `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const [from = 'agente-a', to = 'agente-b', title = 'handoff'] = process.argv.slice(2);
const dir = path.join(root, 'memory/50-orchestration/handoffs');
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:]/g, '-');
const file = path.join(dir, stamp + '_' + from + '_para_' + to + '.md');

const template = '# Handoff: ' + from + ' -> ' + to + '\\n\\n'
  + '## Titulo\\n' + title + '\\n\\n'
  + '## Contexto\\n-\\n\\n'
  + '## Alteracoes\\n-\\n\\n'
  + '## Riscos\\n-\\n\\n'
  + '## Pendencias\\n-\\n\\n'
  + '## Proximo passo\\n-\\n';

fs.writeFileSync(file, template, 'utf8');
console.log('Handoff criado: ' + file);
`,

    'scripts/lib/skill-loader.mjs': `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', '..');

export function loadSkills() {
  const manifestPath = path.join(root, 'skills', 'MANIFEST.json');
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.skills;
}

export function getSkill(id) {
  const skills = loadSkills();
  return skills.find(s => s.id === id);
}
`,

    'scripts/memory-vacuum.mjs': `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const runsDir = path.join(root, 'memory/60-runs');
const archiveDir = path.join(runsDir, 'archive');

const TTL_DAYS = 30;
const now = Date.now();

if (!fs.existsSync(runsDir)) process.exit(0);
if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

const entries = fs.readdirSync(runsDir, { withFileTypes: true });

let archived = 0;
for (const entry of entries) {
  if (entry.name === 'README.md' || entry.name === 'archive' || entry.name === '.gitkeep') continue;
  
  const abs = path.join(runsDir, entry.name);
  const stats = fs.statSync(abs);
  const ageDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);

  if (ageDays > TTL_DAYS) {
    const dest = path.join(archiveDir, entry.name);
    fs.renameSync(abs, dest);
    archived++;
  }
}

if (archived > 0) {
  console.log('Vacuum: ' + archived + ' runs movidas para archive/');
}
`,

    'scripts/memory-watcher.mjs': `import { watch } from 'node:fs';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const watchDirs = ['memory', 'agents', 'skills', 'prompts', 'docs'];
let timeout = null;

console.log('👀 Memory Watcher iniciado...');

watchDirs.forEach(dir => {
  const absDir = path.join(root, dir);
  watch(absDir, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.md')) {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        console.log('🔄 Mudança detectada em: ' + filename + '. Sincronizando SQLite...');
        exec('npm run memory:db:sync', { cwd: path.join(root, 'backend') }, (err, stdout) => {
          if (err) console.error('❌ Erro no sync: ' + err.message);
          else console.log('✅ SQLite sincronizado.');
        });
      }, 1000);
    }
  });
});
`,

    '.gitignore': `node_modules
dist
.env
.DS_Store
coverage
.context
`
  };

  for (const [relativePath, content] of Object.entries(files)) {
    writeFileSafe(path.join(base, relativePath), content);
  }

  const emptyDirs = [
    'memory/30-domains/shared',
    'memory/90-decisions/archive',
    'docs',
    'scripts/lib',
    '.memory/sqlite',
    '.context'
  ];

  for (const relDir of emptyDirs) {
    const abs = path.join(base, relDir);
    ensureDir(abs);
    maybeGitkeep(abs);
  }
}

function writeNestApi(base) {
  const files = {
    'backend/package.json': `{
  "name": "${projectName}-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \\\"src/**/*.ts\\\" --max-warnings=0",
    "format": "prettier --write \\\"src/**/*.ts\\\" \\\"test/**/*.ts\\\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "memory:db:init": "node scripts/memory-db-init.mjs",
    "memory:db:sync": "node scripts/memory-db-sync.mjs",
    "memory:db:query": "node scripts/memory-db-query.mjs",
    "memory:watch": "node ../scripts/memory-watcher.mjs"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\\\.spec\\\\.ts$",
    "transform": {
      "^.+\\\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "better-sqlite3": "^11.8.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/express": "^5.0.1",
    "@types/better-sqlite3": "^11.2.1",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.2",
    "@types/supertest": "^6.0.2",
    "eslint": "^9.16.0",
    "eslint-config-prettier": "^9.1.0",
    "jest": "^29.7.0",
    "prettier": "^3.4.2",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-loader": "^9.5.1",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.7.2"
  }
}
`,

    'backend/nest-cli.json': `{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
`,

    'backend/tsconfig.json': `{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "es2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "strict": true,
    "skipLibCheck": true
  }
}
`,

    'backend/tsconfig.build.json': `{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
`,

    'backend/src/main.ts': `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

void bootstrap();
`,

    'backend/src/app.module.ts': 'import { Module } from "@nestjs/common";\nimport { AppController } from "./app.controller";\nimport { AppService } from "./app.service";\nimport { OpsModule } from "./modules/ops/ops.module";\n\n@Module({\n  imports: [OpsModule],\n  controllers: [AppController],\n  providers: [AppService]\n})\nexport class AppModule {}',

    'backend/src/app.controller.ts': `import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health(): { status: string } {
    return this.appService.health();
  }
}
`,

    'backend/src/app.service.ts': `import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health(): { status: string } {
    return { status: 'ok' };
  }
}
`,

    'backend/src/modules/ops/ops.service.ts': `import { Injectable } from '@nestjs/common';
import * as Database from 'better-sqlite3';
import * as path from 'node:path';

@Injectable()
export class OpsService {
  private db: any;

  constructor() {
    const dbPath = path.resolve(process.cwd(), '..', '.memory', 'sqlite', 'context.db');
    this.db = new (Database as any)(dbPath, { readonly: true });
  }

  getStats() {
    const agents = this.db.prepare('SELECT agent_name, status, current_task FROM agent_sessions').all();
    const tasks = this.db.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all();
    const handoffs = this.db.prepare('SELECT from_agent, to_agent, title, created_at FROM handoffs ORDER BY created_at DESC LIMIT 5').all();
    
    return { agents, tasks, handoffs };
  }
}
`,

    'backend/src/modules/ops/ops.controller.ts': `import { Controller, Get } from '@nestjs/common';
import { OpsService } from './ops.service';

@Controller('ops')
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('stats')
  getStats() {
    return this.opsService.getStats();
  }

  @Get()
  renderDashboard() {
    const stats = this.opsService.getStats();
    
    return \`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Agentes Ops Dashboard</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <meta http-equiv="refresh" content="30">
      </head>
      <body class="bg-gray-900 text-gray-100 font-sans p-8">
          <div class="max-w-6xl mx-auto">
              <header class="flex justify-between items-center mb-12">
                  <h1 class="text-3xl font-bold text-blue-400">🚀 Agentes Operacionais</h1>
                  <div class="text-sm text-gray-400">Sincronizado via SQLite</div>
              </header>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <!-- Agentes -->
                  <section class="bg-gray-800 p-6 rounded-xl border border-gray-700">
                      <h2 class="text-xl font-semibold mb-4 flex items-center">
                          <span class="mr-2">🤖</span> Status dos Agentes
                      </h2>
                      <div class="space-y-4">
                          \${stats.agents.map((a: any) => \`
                              <div class="p-3 bg-gray-900 rounded-lg border-l-4 \${a.status === 'IDLE' ? 'border-green-500' : 'border-yellow-500'}">
                                  <div class="font-bold">\${a.agent_name}</div>
                                  <div class="text-xs text-gray-400">\${a.status} \${a.current_task ? ' - ' + a.current_task : ''}</div>
                              </div>
                          \`).join('')}
                      </div>
                  </section>

                  <!-- Tarefas -->
                  <section class="bg-gray-800 p-6 rounded-xl border border-gray-700">
                      <h2 class="text-xl font-semibold mb-4 flex items-center">
                          <span class="mr-2">📊</span> Backlog & Progresso
                      </h2>
                      <div class="space-y-4">
                          \${stats.tasks.map((t: any) => \`
                              <div class="flex justify-between items-center">
                                  <span class="capitalize">\${t.status}</span>
                                  <span class="bg-blue-600 px-2 py-1 rounded text-xs">\${t.count}</span>
                              </div>
                          \`).join('')}
                      </div>
                  </section>

                  <!-- Handoffs -->
                  <section class="bg-gray-800 p-6 rounded-xl border border-gray-700">
                      <h2 class="text-xl font-semibold mb-4 flex items-center">
                          <span class="mr-2">🤝</span> Últimos Handoffs
                      </h2>
                      <div class="space-y-3">
                          \${stats.handoffs.map((h: any) => \`
                              <div class="text-xs border-b border-gray-700 pb-2">
                                  <div class="text-blue-300 font-medium">\${h.from_agent} → \${h.to_agent}</div>
                                  <div class="text-gray-400 truncate">\${h.title}</div>
                              </div>
                          \`).join('')}
                      </div>
                  </section>
              </div>

              <footer class="mt-12 text-center text-gray-500 text-xs">
                  Atualizado em: \${new Date().toLocaleString('pt-BR')} | create-memory-nest-kit v0.5.0
              </footer>
          </div>
      </body>
      </html>
    \`;
  }
}
`,

    'backend/src/modules/ops/ops.module.ts': `import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  controllers: [OpsController],
  providers: [OpsService]
})
export class OpsModule {}
`,

    'backend/src/app.controller.spec.ts': `import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService]
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('health() deve retornar status ok', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });
});
`,

    'backend/test/app.e2e-spec.ts': `import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/api/health (GET)', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
`,

    'backend/jest-e2e.json': `{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\\\.(t|j)s$": "ts-jest"
  }
}
`,

    'backend/scripts/memory-db-schema.sql': `PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  title TEXT,
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_unique
ON document_chunks (document_id, chunk_index);

CREATE TABLE IF NOT EXISTS handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  from_agent TEXT,
  to_agent TEXT,
  title TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS adrs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adr_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'accepted',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_summaries_scope
ON summaries (scope, scope_key);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  owner_agent TEXT,
  source_file TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'IDLE', -- IDLE, BUSY, FAILING
  current_task TEXT,
  updated_at TEXT NOT NULL
);
`,

    'backend/scripts/memory-db-init.mjs': `import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');
const dbDir = path.join(projectRoot, '.memory', 'sqlite');
const dbPath = path.join(dbDir, 'context.db');
const schemaPath = path.join(__dirname, 'memory-db-schema.sql');

fs.mkdirSync(dbDir, { recursive: true });
const schema = fs.readFileSync(schemaPath, 'utf8');
const db = new Database(dbPath);
db.exec(schema);
db.close();

console.log('SQLite inicializado em: ' + dbPath);
`,

    'backend/scripts/memory-db-sync.mjs': `import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');
const dbPath = path.join(projectRoot, '.memory', 'sqlite', 'context.db');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(abs);
  }
  return out;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function getKind(relPath) {
  if (relPath.startsWith('memory/50-orchestration/handoffs/')) return 'handoff';
  if (relPath.startsWith('memory/90-decisions/ADR-')) return 'adr';
  if (relPath.startsWith('memory/70-summaries/')) return 'summary';
  if (relPath.startsWith('memory/')) return 'memory';
  if (relPath.startsWith('agents/')) return 'agent';
  if (relPath.startsWith('skills/')) return 'skill';
  if (relPath.startsWith('prompts/')) return 'prompt';
  if (relPath.startsWith('docs/')) return 'doc';
  return 'other';
}

function getTitle(md) {
  const m = md.match(/^#\\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function splitChunks(content, size = 1600) {
  const chunks = [];
  for (let i = 0; i < content.length; i += size) {
    chunks.push(content.slice(i, i + size));
  }
  return chunks;
}

const roots = ['memory', 'docs', 'agents', 'skills', 'prompts'].map((r) => path.join(projectRoot, r));
const mdFiles = roots.flatMap((r) => walk(r)).sort();

if (!fs.existsSync(dbPath)) {
  console.error('Banco nao encontrado: ' + dbPath);
  console.error('Rode primeiro: npm run memory:db:init');
  process.exit(1);
}

const db = new Database(dbPath);
const now = new Date().toISOString();

const upsertDoc = db.prepare(
  'INSERT INTO documents (path, kind, title, content_hash, content, updated_at) VALUES (?, ?, ?, ?, ?, ?) '
  + 'ON CONFLICT(path) DO UPDATE SET kind=excluded.kind, title=excluded.title, content_hash=excluded.content_hash, content=excluded.content, updated_at=excluded.updated_at'
);
const selectDocId = db.prepare('SELECT id FROM documents WHERE path = ?');
const deleteChunks = db.prepare('DELETE FROM document_chunks WHERE document_id = ?');
const insertChunk = db.prepare(
  'INSERT INTO document_chunks (document_id, chunk_index, content, token_estimate) VALUES (?, ?, ?, ?)'
);

const upsertHandoff = db.prepare(
  'INSERT INTO handoffs (file_path, from_agent, to_agent, title, created_at, status) VALUES (?, ?, ?, ?, ?, ?) '
  + 'ON CONFLICT(file_path) DO UPDATE SET from_agent=excluded.from_agent, to_agent=excluded.to_agent, title=excluded.title, created_at=excluded.created_at'
);

const upsertAdr = db.prepare(
  'INSERT INTO adrs (adr_code, title, file_path, status, updated_at) VALUES (?, ?, ?, ?, ?) '
  + 'ON CONFLICT(adr_code) DO UPDATE SET title=excluded.title, file_path=excluded.file_path, status=excluded.status, updated_at=excluded.updated_at'
);

const upsertSummary = db.prepare(
  'INSERT INTO summaries (scope, scope_key, file_path, summary, updated_at) VALUES (?, ?, ?, ?, ?) '
  + 'ON CONFLICT(file_path) DO UPDATE SET scope=excluded.scope, scope_key=excluded.scope_key, summary=excluded.summary, updated_at=excluded.updated_at'
);

const upsertTask = db.prepare(
  'INSERT INTO tasks (task_key, title, status, owner_agent, source_file, updated_at) VALUES (?, ?, ?, ?, ?, ?) '
  + 'ON CONFLICT(task_key) DO UPDATE SET title=excluded.title, status=excluded.status, owner_agent=excluded.owner_agent, source_file=excluded.source_file, updated_at=excluded.updated_at'
);

const tx = db.transaction(() => {
  for (const abs of mdFiles) {
    const rel = toPosix(path.relative(projectRoot, abs));
    const raw = fs.readFileSync(abs, 'utf8');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const kind = getKind(rel);
    const title = getTitle(raw);

    upsertDoc.run(rel, kind, title, hash, raw, now);
    const row = selectDocId.get(rel);
    if (!row) continue;

    deleteChunks.run(row.id);
    const chunks = splitChunks(raw);
    chunks.forEach((chunk, i) => {
      const tokens = Math.ceil(chunk.length / 4);
      insertChunk.run(row.id, i, chunk, tokens);
    });

    if (kind === 'handoff' && !rel.endsWith('/README.md')) {
      const base = path.basename(rel, '.md');
      const fromTo = base.split('_').slice(1).join('_');
      const from = fromTo.split('_para_')[0] || null;
      const to = fromTo.split('_para_')[1] || null;
      upsertHandoff.run(rel, from, to, title || base, now, 'open');
    }

    if (kind === 'adr') {
      const code = path.basename(rel, '.md').split('-').slice(0, 2).join('-');
      upsertAdr.run(code, title || code, rel, 'accepted', now);
    }

    if (kind === 'summary') {
      const file = path.basename(rel, '.md');
      const scope = file.includes('global') ? 'global' : 'domain';
      const scopeKey = file.replace('-summary', '');
      upsertSummary.run(scope, scopeKey, rel, raw.slice(0, 20000), now);
    }

    if (rel === 'memory/40-delivery/current-sprint.md' || rel === 'memory/40-delivery/backlog.md') {
      const lines = raw.split('\\n');
      for (const line of lines) {
        const m = line.match(/^[-*]\\s+\\[\\s\\]\\s+(.+)$/);
        if (!m) continue;
        const taskTitle = m[1].trim();
        const taskKey = crypto.createHash('md5').update(rel + ':' + taskTitle).digest('hex');
        upsertTask.run(taskKey, taskTitle, 'open', null, rel, now);
      }
    }
  }
});

tx();
db.close();
console.log('Sync concluido. Arquivos indexados: ' + mdFiles.length);
`,

    'backend/scripts/memory-db-query.mjs': `import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');
const dbPath = path.join(projectRoot, '.memory', 'sqlite', 'context.db');

const args = process.argv.slice(2);
const mode = args[0] || 'search';
const term = args[1] || '';
const limit = Number(args[2] || 10);

const db = new Database(dbPath, { readonly: true });

if (mode === 'handoffs') {
  const rows = db.prepare(
    'SELECT file_path, from_agent, to_agent, title, created_at FROM handoffs ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
  for (const row of rows) {
    console.log('- ' + row.created_at + ' | ' + row.from_agent + ' -> ' + row.to_agent + ' | ' + row.title);
    console.log('  ' + row.file_path);
  }
  process.exit(0);
}

if (mode === 'adrs') {
  const rows = db.prepare(
    'SELECT adr_code, title, status, file_path, updated_at FROM adrs ORDER BY adr_code LIMIT ?'
  ).all(limit);
  for (const row of rows) {
    console.log('- ' + row.adr_code + ' | ' + row.status + ' | ' + row.title);
    console.log('  ' + row.file_path + ' (' + row.updated_at + ')');
  }
  process.exit(0);
}

const rows = db.prepare(
  'SELECT path, kind, title, substr(content, 1, 200) as snippet FROM documents '
  + 'WHERE content LIKE ? OR title LIKE ? OR path LIKE ? '
  + 'ORDER BY updated_at DESC LIMIT ?'
).all('%' + term + '%', '%' + term + '%', '%' + term + '%', limit);

for (const row of rows) {
  console.log('- [' + row.kind + '] ' + row.path);
  if (row.title) console.log('  titulo: ' + row.title);
  console.log('  trecho: ' + row.snippet.replace(/\\n/g, ' '));
}
`
  };

  for (const [relativePath, content] of Object.entries(files)) {
    writeFileSafe(path.join(base, relativePath), content);
  }
}

function writeReadme(base) {
  const content = `# create-memory-nest-kit v0.5.0

Scaffold para projetos grandes com:
- memoria hierarquica e resumida
- suporte operacional para multiagentes
- handoff e continuidade de execucao
- API NestJS por padrao
- comunicacao em pt-BR

## Importante sobre 1M+ de tokens
Este kit **nao altera limite nativo** de contexto do modelo.
Ele permite operar em larga escala com segmentacao, resumo e handoff incremental.

## Uso local

\`node ./bin/create-memory-nest-kit.js meu-projeto\`

## Uso via npx (GitHub)

\`npx github:SEU_USUARIO/create-memory-nest-kit meu-projeto\`

## Uso via npx (npm)

\`npx create-memory-nest-kit@latest meu-projeto\`

## Flags

- \`--force\`: sobrescreve arquivos existentes
- \`--only-memory\`: gera apenas memoria + agents + skills
- \`--no-gitkeep\`: nao cria .gitkeep em diretorios vazios

## Scripts uteis no projeto gerado

- \`node scripts/build-context-pack.mjs\`
- \`node scripts/append-handoff.mjs worker-a worker-b "titulo"\`
- \`cd backend && npm run memory:db:init\`
- \`cd backend && npm run memory:db:sync\`
- \`cd backend && npm run memory:db:query -- "termo"\`
`;

  writeFileSafe(path.join(base, 'README.md'), content);
}

function run() {
  try {
    ensureDir(targetDir);

    writeMemoryAndOps(targetDir);
    if (!options.onlyMemory) writeNestApi(targetDir);
    writeReadme(targetDir);

    log('✅ Estrutura v0.5.0 criada com sucesso.');
    log(`📁 Diretorio: ${targetDir}`);
    log('➡️ Proximos passos:');
    log(`   1) cd ${path.relative(process.cwd(), targetDir) || '.'}`);
    log('   2) node scripts/build-context-pack.mjs');
    if (!options.onlyMemory) {
      log('   3) cd backend && npm install');
      log('   4) npm run start:dev');
    }
  } catch (error) {
    console.error(`❌ Erro: ${error.message}`);
    process.exit(1);
  }
}

run();
