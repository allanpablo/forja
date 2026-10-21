/**
 * Memory Generator - Gera estrutura completa de memória hierárquica
 * Extraído de create-memory-nest-kit.js para modularização
 */

import path from 'node:path';
import { writeFileSafe, ensureDir, maybeGitkeep } from '../utils/file-helpers.ts';

/**
 * Template de arquivos da estrutura de memória
 * Organizado por categorias para facilitar manutenção
 */
const memoryTemplates = {
  // === GLOBAL (00-global) ===
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
1. Localize o arquivo \`.forja/models.json\`.
2. Identifique o proximo motor na \`fallback_chain\`.
3. O novo motor le as mesmas instrucoes (\`AGENTS.md\`; o arquivo nativo dele esta em \`instruction_file\`).
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

  // === PRODUCT (10-product) ===
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

  // === ARCHITECTURE (20-architecture) ===
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

  // === DOMAINS (30-domains) ===
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

  // === DELIVERY (40-delivery) ===
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

  // === ORCHESTRATION (50-orchestration) ===
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

  // === RUNS (60-runs) ===
  'memory/60-runs/README.md': `# Runs

Log de execucao por ciclo/sprint.
`,

  // === SUMMARIES (70-summaries) ===
  'memory/70-summaries/global-summary.md': `# Resumo Global

Atualize a cada marco importante com:
- estado atual
- decisoes novas
- riscos ativos
`,

  'memory/70-summaries/domain-summary.md': `# Resumo por Dominio

Mantenha resumos curtos por dominio para carregamento rapido de contexto.
`,

  // === DATA (80-data) ===
  'memory/80-data/memory-db.md': `# Memory DB (SQLite)

## Objetivo
Armazenar indice operacional da documentacao para busca e continuidade de contexto.

## Fonte da verdade
- Arquivos Markdown em memory/, docs/, agents/, prompts/

## Banco
- SQLite em .memory/sqlite/context.db

## Fluxo
1. Atualizar markdown
2. Rodar sincronizacao
3. Consultar contexto por texto ou tipo
`,

  // === DECISIONS (90-decisions) ===
  // Mesmo formato do template do framework: com Status/Data o adr:list e o grafo reconhecem a ADR.
  // Nome com `_` (não `ADR-0001-…`) para o template não ser contado como uma decisão real.
  'memory/90-decisions/_template.md': `# ADR-XXXX: <título curto>

- **Status**: proposed | accepted | superseded by ADR-YYYY | deprecated
- **Data**: YYYY-MM-DD
- **Autor(es)**: <nome>
- **Tags**: <ex: security, api, dados>

## Contexto
<O que motivou esta decisão? Qual o problema? Quais restrições existem?>

## Decisão
<O que foi decidido, no imperativo.>

## Alternativas consideradas
- **Opção A**: <descrição> — rejeitada porque <razão>

## Consequências
<Ganhos, custos e o que passa a ser obrigatório.>
`,
};

/**
 * Gera estrutura de agentes
 */
const agentTemplates = {
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
};

// Skills do projeto: instaladas pelo project:wire em .claude/skills/ e .agents/skills/ a partir de
// templates/project/skills/ (SPEC-051). As 9 "skills" de esboço que viviam aqui ficavam em skills/
// sem frontmatter, onde nenhuma IA as carregava.

/**
 * Gera estrutura de prompts
 */
const promptTemplates = {
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
};

/**
 * Gera arquivos de configuração globais
 */
const configTemplates = {
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

  '.gitignore': `node_modules
dist
.env
.DS_Store
coverage
.context
`,
};

/**
 * Gera scripts utilitários
 */
const scriptTemplates = {
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

  'scripts/check-memory-maps.mjs': `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Gate herdado do Forja (ADR-0030): os mapas de memoria (context.md) nao mentem sobre o codigo.
// Self-contained, zero dependencia. Rode no CI: node scripts/check-memory-maps.mjs
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const domainsDir = path.join(root, 'memory/30-domains');
const modulesDir = path.join(root, 'backend/src/modules');
const BT = String.fromCharCode(96);
const CODE_REF = new RegExp(BT + '([a-z][a-zA-Z0-9/._-]*/[a-zA-Z0-9/._-]*[.]ts)' + BT, 'g');

function dirs(p) {
  try { return fs.readdirSync(p).filter((e) => fs.statSync(path.join(p, e)).isDirectory()); }
  catch { return []; }
}
function resolves(domain, ref) {
  const bases = [path.join(modulesDir, domain), path.join(root, 'backend'), root];
  return bases.some((b) => fs.existsSync(path.join(b, ref)));
}

let dangling = 0;
const domains = dirs(domainsDir);
for (const d of domains) {
  let src;
  try { src = fs.readFileSync(path.join(domainsDir, d, 'context.md'), 'utf8'); }
  catch { continue; }
  const refs = [...new Set([...src.matchAll(CODE_REF)].map((m) => m[1]))];
  const bad = refs.filter((r) => !resolves(d, r));
  if (bad.length) { dangling += bad.length; console.log('x ' + d + ': ' + bad.join(', ') + ' -- o mapa aponta, o arquivo nao existe'); }
  else { console.log('ok ' + d + ' -- ' + refs.length + ' referencia(s)'); }
}
const mapped = new Set(domains);
for (const m of dirs(modulesDir)) {
  if (!mapped.has(m)) console.log('! modulo ' + m + ' sem context.md -- economia de token perdida');
}
if (dangling) {
  console.log('');
  console.log('REPROVADO -- ' + dangling + ' referencia(s) pendurada(s). Corrija o context.md ou o path.');
  process.exit(1);
}
console.log('');
console.log('OK -- os mapas de memoria batem com o codigo.');
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

const watchDirs = ['memory', 'agents', 'prompts', 'docs'];
let timeout = null;

console.log('👀 Memory Watcher iniciado...');

watchDirs.forEach(dir => {
  const absDir = path.join(root, dir);
  watch(absDir, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.md')) {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        console.log('🔄 Mudança detectada em: ' + filename + '. Sincronizando SQLite...');
        exec('forja sync:universal', { cwd: root }, (err, stdout) => {
          if (err) console.error('❌ Erro no sync: ' + err.message);
          else console.log('✅ SQLite sincronizado.');
        });
      }, 1000);
    }
  });
});
`,
};

/**
 * Retorna todos os templates combinados
 */
export function getAllMemoryTemplates() {
  return {
    ...memoryTemplates,
    ...agentTemplates,
    ...promptTemplates,
    ...configTemplates,
    ...scriptTemplates,
  };
}

/**
 * Escreve a estrutura completa de memória
 * @param {string} baseDir - Diretório base para geração
 * @param {Object} options - Opções (force, noGitkeep)
 */
export function generateMemoryStructure(baseDir: any, options = {}) {
  const allTemplates = getAllMemoryTemplates();

  // Escrever todos os arquivos
  for (const [relativePath, content] of Object.entries(allTemplates)) {
    writeFileSafe(path.join(baseDir, relativePath), content, options);
  }

  // Criar diretórios vazios
  const emptyDirs = [
    'memory/30-domains/shared',
    'memory/90-decisions/archive',
    'docs',
    'scripts/lib',
    '.memory/sqlite',
    '.context',
  ];

  for (const relDir of emptyDirs) {
    const abs = path.join(baseDir, relDir);
    ensureDir(abs);
    maybeGitkeep(abs, options);
  }

  return {
    success: true,
    filesWritten: Object.keys(allTemplates).length,
    emptyDirsCreated: emptyDirs.length,
  };
}

export default {
  generateMemoryStructure,
  getAllMemoryTemplates,
};
