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
- Arquivos Markdown em memory/, docs/, agents/, skills/, prompts/

## Banco
- SQLite em .memory/sqlite/context.db

## Fluxo
1. Atualizar markdown
2. Rodar sincronizacao
3. Consultar contexto por texto ou tipo
`,

  // === DECISIONS (90-decisions) ===
  'memory/90-decisions/ADR-0001-template.md': `# ADR-0001: Titulo da Decisao

## Contexto

## Decisao

## Consequencias

## Alternativas consideradas
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

/**
 * Gera estrutura de skills
 */
const skillTemplates = {
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

  'skills/llm-provider-routing/SKILL.md': `# Skill: Roteamento de LLM Providers

## Objetivo
Selecionar e configurar uma LLM por papel sem amarrar o projeto a um unico fornecedor.

## Quando usar
- O usuario pedir DeepSeek, MiniMax, Mistral, Qwen, Ollama, OpenRouter, Together, Groq, xAI, Cohere, Perplexity ou outro provider.
- Um papel precisar trocar de modelo por custo, cota, latencia, contexto, privacidade ou qualidade.
- Uma CLI/API externa precisar entrar no fluxo de handoffs sem alterar o SDD.

## Regras
- Preferir providers locais para tarefas sensiveis quando o modelo disponivel for suficiente.
- Usar \`manual\` quando o provider nao tiver CLI local confiavel.
- Registrar \`provider\`, \`model\`, \`command\`, \`taskTypes\` e \`notes\` em \`.memory/agent-llm-routing.json\`.
- Nao assumir que uma CLI existe: validar o binario ou documentar o comando esperado.
- Nao colocar API keys em memoria, specs, handoffs ou logs.

## Checklist
1. Identificar papel e tipo de tarefa.
2. Escolher provider e modelo no dashboard ou via API \`/api/llm-routing/:role\`.
3. Preencher \`command\` com a CLI real ou wrapper local.
4. Rodar um teste pequeno antes de delegar sprint inteira.
5. Registrar handoff Hermes quando a troca impactar entrega.
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
    { "id": "reasoning", "path": "skills/reasoning-protocol/SKILL.md", "description": "Protocolo de raciocínio lógico" },
    { "id": "llm-provider-routing", "path": "skills/llm-provider-routing/SKILL.md", "description": "Roteamento multi-LLM por papel" }
  ]
}
`,
};

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
};

/**
 * Retorna todos os templates combinados
 */
export function getAllMemoryTemplates() {
  return {
    ...memoryTemplates,
    ...agentTemplates,
    ...skillTemplates,
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
