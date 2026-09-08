/**
 * lib/core/registry.mjs
 *
 * Registry declarativo do core Forja (ADR-0020).
 * Cada comando declara: domínio, descrição, alvo de execução e gates.
 *
 * Alvos:
 *   - node: script do repo executado com `node <script> [...args]`
 *   - bin:  binário externo no PATH (ex.: codegraph)
 *   - capability: handler compartilhado do Capability Registry
 *
 * Gates (aplicados por bin/forja.mjs antes do alvo):
 *   - workspace       bloqueia se o workspace (ADR-0019) não existir
 *   - workspace-warn  avisa se o workspace não existir, mas segue
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve o `node:` de um comando para o arquivo real, **agnóstico de extensão** (SPEC-012 D2).
 * Tenta `.ts → .js → .mjs`: em dev acha a fonte `.ts`; no pacote publicado, o `.js` sob `dist/`.
 * Desacopla o registry do runtime — a entrada pode manter `.mjs` que este resolver ainda acha o
 * `.ts` renomeado. Sem isto, renomear um script quebraria o dispatch.
 *
 * @param {string} root  Raiz onde os scripts vivem (repo em dev, `dist/` no publicado).
 * @param {string} node  Caminho do registry, com ou sem extensão.
 * @returns {string}     Caminho absoluto do arquivo que existe (ou o candidato original, que falha visível).
 */
export function resolveScript(root: any, node: any) {
  const direct = path.join(root, node);
  if (fs.existsSync(direct)) return direct;
  const base = direct.replace(/\.(mjs|cjs|js|ts)$/, '');
  for (const ext of ['.ts', '.js', '.mjs']) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  return direct;
}

export const DOMAINS = {
  workspace: 'Workspace & projetos',
  sdd: 'Pipeline SDD (spec → plan → tasks → check)',
  gsd: 'GSD & handoffs',
  design: 'Design',
  code: 'Code intelligence (codegraph)',
  memoria: 'Memória',
  contexto: 'Contexto & token economy',
  llm: 'LLMs & execução supervisionada',
  governanca: 'Governança & qualidade',
  geracao: 'Geração de projetos',
};

export interface CommandArg {
  readonly name: string;
  readonly required: boolean;
  readonly desc: string;
}

/**
 * SPEC-043 — campos que tornam a CLI descobrível por ela mesma.
 *
 * `domain`/`desc` e os alvos de execução (`node`/`bin`/`capability` + `args`/`gates`) são o
 * contrato antigo. Tudo abaixo de `usage` é **opcional e aditivo**: um comando sem nenhum desses
 * campos continua válido e é tratado como `tier: 'advanced'`. `forja help` (curto) mostra só
 * `tier: 'core'`; `forja help <cmd>` renderiza `usage`/`cliArgs`/`examples`/`next`/`spec`.
 */
export interface CommandSpec {
  readonly domain: keyof typeof DOMAINS;
  readonly desc: string;
  readonly node?: string;
  readonly bin?: string;
  readonly capability?: string;
  readonly args?: readonly string[];
  readonly gates?: readonly string[];
  /** Linha de uso, ex.: `forja spec:new <slug>`. */
  readonly usage?: string;
  /** Args POSICIONAIS do comando — distinto de `args` (prefixo fixo repassado ao script). */
  readonly cliArgs?: readonly CommandArg[];
  /** Cada exemplo começa com `forja ` e cita um comando existente. */
  readonly examples?: readonly string[];
  /** Comandos que costumam vir depois (nomes do registry). */
  readonly next?: readonly string[];
  /** SPEC/ADR de origem, ex.: `SPEC-021`. Antes ficava embutido em `desc`. */
  readonly spec?: string;
  readonly readonly?: boolean;
  /** Reservado para o contrato de saída (W5). Só declarado nesta versão. */
  readonly json?: boolean;
  /** `core` aparece em `forja help`; ausente ou `advanced` só em `forja help --all`. */
  readonly tier?: 'core' | 'advanced';
}

export const COMMANDS: Record<string, CommandSpec> = {
  // --- Workspace & projetos ---------------------------------------------
  'workspace:init': {
    domain: 'workspace',
    desc: 'Cria a estrutura base do workspace (~/forja-workspace)',
    node: 'scripts/agent-harness.ts',
    args: ['workspace:init'],
    tier: 'core',
    usage: 'forja workspace:init',
    examples: ['forja workspace:init'],
    next: ['project:new', 'sync:universal'],
  },
  'project:new': {
    domain: 'workspace',
    desc: 'Cria projeto no workspace e registra ficha em 30-projects/',
    node: 'scripts/agent-harness.ts',
    args: ['project:new'],
    gates: ['workspace'],
    tier: 'core',
    usage: 'forja project:new <nome> [-- --ai claude,copilot]',
    cliArgs: [{ name: 'nome', required: true, desc: 'slug do projeto (kebab-case)' }],
    examples: ['forja project:new meu-app -- --ai claude,copilot'],
    next: ['workspace:project:check'],
  },
  setup: {
    domain: 'workspace',
    desc: 'Rotina de primeiro uso: workspace:init + sync:universal, atrás de confirmação',
    node: 'scripts/forja-setup.ts',
    spec: 'SPEC-043',
    tier: 'core',
    readonly: false,
    usage: 'forja setup [--yes]',
    examples: ['forja setup', 'forja setup --yes'],
    next: ['project:new', 'spec:new'],
  },
  'project:list': {
    domain: 'workspace',
    desc: 'Lista projetos do workspace',
    node: 'scripts/agent-harness.ts',
    args: ['project:list'],
  },
  'project:upgrade': {
    domain: 'workspace',
    desc: 'Traz peças novas de scaffold para um projeto gerado — aditivo (SPEC-018). --apply para copiar',
    node: 'scripts/project-upgrade.ts',
  },
  'workspace:project:check': {
    domain: 'workspace',
    desc: 'Valida padrões em um projeto do workspace',
    node: 'scripts/agent-harness.ts',
    args: ['project:check'],
    gates: ['workspace'],
  },

  // --- Pipeline SDD -------------------------------------------------------
  'spec:new': {
    domain: 'sdd',
    desc: 'Cria specs/<slug>/spec.md a partir do template',
    node: 'scripts/spec-cli.ts',
    args: ['new'],
    tier: 'core',
    usage: 'forja spec:new <slug>',
    cliArgs: [{ name: 'slug', required: true, desc: 'identificador da feature em kebab-case' }],
    examples: ['forja spec:new pagamentos-pix'],
    next: ['spec:plan', 'spec:check'],
  },
  'spec:plan': {
    domain: 'sdd',
    desc: 'Deriva plan.md de uma spec',
    node: 'scripts/spec-cli.ts',
    args: ['plan'],
    tier: 'core',
    usage: 'forja spec:plan <slug>',
    cliArgs: [{ name: 'slug', required: true, desc: 'feature com spec.md em approved' }],
    examples: ['forja spec:plan pagamentos-pix'],
    next: ['spec:tasks'],
  },
  'spec:tasks': {
    domain: 'sdd',
    desc: 'Decompõe plan.md em tasks.md',
    node: 'scripts/spec-cli.ts',
    args: ['tasks'],
    tier: 'core',
    usage: 'forja spec:tasks <slug>',
    cliArgs: [{ name: 'slug', required: true, desc: 'feature com plan.md em approved' }],
    examples: ['forja spec:tasks pagamentos-pix'],
    next: ['hermes:handoff'],
  },
  'spec:check': {
    domain: 'sdd',
    desc: 'Valida completude da spec (gate de governança)',
    node: 'scripts/spec-cli.ts',
    args: ['check'],
    tier: 'core',
    readonly: true,
    json: true,
    usage: 'forja spec:check [slug] [--json]',
    cliArgs: [{ name: 'slug', required: false, desc: 'feature; omitido = valida todas' }],
    examples: ['forja spec:check', 'forja spec:check pagamentos-pix', 'forja spec:check --json'],
    next: ['spec:plan'],
  },

  // --- GSD & handoffs ------------------------------------------------------
  status: {
    domain: 'gsd',
    desc: 'Retrato único do estado: workspace, sprint, corrida, specs, runs, handoffs',
    node: 'scripts/forja-status.ts',
    args: ['status'],
    gates: ['workspace-warn'],
    spec: 'SPEC-044',
    tier: 'core',
    readonly: true,
    json: true,
    usage: 'forja status [--json]',
    examples: ['forja status', 'forja status --json'],
    next: ['next'],
  },
  next: {
    domain: 'gsd',
    desc: 'A próxima ação recomendada + o comando exato para executá-la',
    node: 'scripts/forja-status.ts',
    args: ['next'],
    gates: ['workspace-warn'],
    spec: 'SPEC-044',
    tier: 'core',
    readonly: true,
    json: true,
    usage: 'forja next [--json]',
    examples: ['forja next'],
    next: ['status'],
  },
  orchestrate: {
    domain: 'gsd',
    desc: 'Abre uma corrida: a cadeia SDD/GSD como máquina de estados guardada por gates',
    node: 'scripts/orchestrate.ts',
    args: ['start'],
    spec: 'SPEC-021',
    tier: 'core',
    usage: 'forja orchestrate "<objetivo>" --slug <slug>',
    cliArgs: [{ name: 'objetivo', required: true, desc: 'frase do que a corrida entrega (entre aspas)' }],
    examples: ['forja orchestrate "checkout via pix" --slug pagamentos-pix'],
    next: ['orchestrate:status', 'orchestrate:advance'],
  },
  'orchestrate:status': {
    domain: 'gsd',
    desc: 'O estado da corrida: etapas feitas, aberta, gates e vereditos',
    node: 'scripts/orchestrate.ts',
    args: ['status'],
    spec: 'SPEC-021',
    tier: 'core',
    readonly: true,
    usage: 'forja orchestrate:status [--slug <slug>]',
    examples: ['forja orchestrate:status'],
    next: ['orchestrate:advance'],
  },
  'orchestrate:advance': {
    domain: 'gsd',
    desc: 'Roda o gate da etapa aberta; verde → abre a próxima; vermelho → trava com o parecer',
    node: 'scripts/orchestrate.ts',
    args: ['advance'],
    spec: 'SPEC-021',
    tier: 'core',
    usage: 'forja orchestrate:advance [--slug <slug>]',
    examples: ['forja orchestrate:advance'],
    next: ['orchestrate:status'],
  },
  'gsd:plan': {
    domain: 'gsd',
    desc: 'Cria runbook GSD em .context/',
    node: 'scripts/agent-harness.ts',
    args: ['gsd:plan'],
  },
  'gsd:handoff': {
    domain: 'gsd',
    desc: 'Registra handoff GSD padronizado (ADR-0005)',
    node: 'scripts/agent-harness.ts',
    args: ['gsd:handoff'],
  },
  'gsd:check': {
    domain: 'gsd',
    desc: 'Valida gates básicos do runbook GSD',
    node: 'scripts/agent-harness.ts',
    args: ['gsd:check'],
  },
  'hermes:handoff': {
    domain: 'gsd',
    desc: 'Registra handoff ADR-0005 bruto via agent-router',
    node: 'scripts/agent-harness.ts',
    args: ['hermes:handoff'],
  },
  'agent:route': {
    domain: 'gsd',
    desc: 'Roteia/inspeciona handoffs (agent-router)',
    node: 'scripts/agent-router.ts',
  },
  'sprint:start': {
    domain: 'gsd',
    desc: 'Inicia sprint',
    node: 'scripts/sprint-manager.ts',
    args: ['start'],
  },
  'sprint:status': {
    domain: 'gsd',
    desc: 'Status da sprint atual',
    node: 'scripts/sprint-manager.ts',
    args: ['status'],
  },
  'sprint:complete': {
    domain: 'gsd',
    desc: 'Encerra sprint',
    node: 'scripts/sprint-manager.ts',
    args: ['complete'],
  },

  // --- Design ---------------------------------------------------------------
  'design:check': {
    domain: 'design',
    desc: 'Valida brief visual antes do handoff',
    node: 'scripts/agent-harness.ts',
    args: ['design:check'],
  },
  'design:select': {
    domain: 'design',
    desc: 'Sugere referências design-md por superfície',
    node: 'scripts/agent-harness.ts',
    args: ['design:select'],
  },

  // --- Code intelligence ------------------------------------------------------
  'code:check': {
    domain: 'code',
    desc: 'Valida índice codegraph (worktree + freshness)',
    node: 'scripts/agent-harness.ts',
    args: ['code:check'],
  },
  'code:impact': {
    domain: 'code',
    desc: 'Chamadores + blast radius de um símbolo',
    node: 'scripts/agent-harness.ts',
    args: ['code:impact'],
  },
  'graph:sync': {
    domain: 'code',
    desc: 'Indexa arquivos rastreáveis do workspace no GraphLoop por checksum',
    capability: 'graph.sync',
    gates: ['workspace-warn'],
  },
  'drift:check': {
    domain: 'code',
    desc: 'Reindexa e sinaliza relações verified que a extração atual não reproduz mais (SPEC-030). --domain <d> restringe',
    node: 'scripts/drift-check.ts',
    gates: ['workspace-warn'],
  },
  'adr:list': {
    domain: 'code',
    desc: 'Lista ADRs (memory/90-decisions/) com status, via Engineering Graph (SPEC-032)',
    node: 'scripts/adr.ts',
    args: ['list'],
    gates: ['workspace-warn'],
  },
  'adr:show': {
    domain: 'code',
    desc: 'Mostra uma ADR: status, arquivo, constraints (SPEC-032)',
    node: 'scripts/adr.ts',
    args: ['show'],
    gates: ['workspace-warn'],
  },
  'adr:impact': {
    domain: 'code',
    desc: 'Componentes/documentos alcançáveis a partir de uma ADR, via GraphLoop.impact (SPEC-032)',
    node: 'scripts/adr.ts',
    args: ['impact'],
    gates: ['workspace-warn'],
  },
  'adr:graph': {
    domain: 'code',
    desc: 'Subgrafo (JSON) de nós ADR/SPEC + vizinhança (SPEC-032)',
    node: 'scripts/adr.ts',
    args: ['graph'],
    gates: ['workspace-warn'],
  },
  'architecture:compile': {
    domain: 'code',
    desc: 'ADRs (## Constraints) → .context/architecture/constitution.json (SPEC-033)',
    node: 'scripts/architecture.ts',
    args: ['compile'],
  },
  'architecture:check': {
    domain: 'code',
    desc: 'Verifica o código real contra a Architecture Constitution compilada (SPEC-033)',
    node: 'scripts/architecture.ts',
    args: ['check'],
    gates: ['workspace-warn'],
  },
  'architecture:status': {
    domain: 'code',
    desc: 'Resumo da Constitution: regras active/proposed, última compilação (SPEC-033)',
    node: 'scripts/architecture.ts',
    args: ['status'],
  },
  'architecture:explain': {
    domain: 'code',
    desc: 'Explica uma regra da Constitution: ADR de origem, severidade, texto original (SPEC-033)',
    node: 'scripts/architecture.ts',
    args: ['explain'],
  },
  'architecture:approve': {
    domain: 'code',
    desc: 'Promove uma regra proposed a active via ApprovalLedger (SPEC-033)',
    node: 'scripts/architecture.ts',
    args: ['approve'],
  },
  'risk:assess': {
    domain: 'code',
    desc: 'Score de risco 0-100 (7 fatores) sobre o diff de um ref (default: working tree) (SPEC-034)',
    node: 'scripts/risk.ts',
    args: ['assess'],
    gates: ['workspace-warn'],
  },
  'risk:explain': {
    domain: 'code',
    desc: 'Reexibe um assessment de risco já calculado, com todos os fatores (SPEC-034)',
    node: 'scripts/risk.ts',
    args: ['explain'],
  },
  'evidence:show': {
    domain: 'code',
    desc: 'View agregada de evidência de um run: intent, agente, testes, aprovações (SPEC-035)',
    node: 'scripts/evidence.ts',
    args: ['show'],
    gates: ['workspace-warn'],
  },
  'engineer': {
    domain: 'code',
    desc: 'Façade: contexto + ADRs relevantes + architecture:check + risco + fluxo recomendado',
    node: 'scripts/engineer.ts',
    gates: ['workspace-warn'],
    spec: 'SPEC-035',
    tier: 'core',
    json: true,
    usage: 'forja engineer "<objetivo>" [--ref <ref>] [--role <role>] [--json]',
    cliArgs: [{ name: 'objetivo', required: true, desc: 'o que você quer fazer (entre aspas)' }],
    examples: ['forja engineer "adicionar rate limit no login"', 'forja engineer "auth por token" --json'],
    next: ['risk:assess'],
  },
  'agent:register': {
    domain: 'code',
    desc: 'Registra/atualiza um agente (role/provider/model/capabilities/domains) (SPEC-036)',
    node: 'scripts/agent.ts',
    args: ['register'],
    gates: ['workspace-warn'],
  },
  'agent:list': {
    domain: 'code',
    desc: 'Lista agentes registrados, com trustLevel se já pontuados (SPEC-036)',
    node: 'scripts/agent.ts',
    args: ['list'],
    gates: ['workspace-warn'],
  },
  'agent:show': {
    domain: 'code',
    desc: 'Detalhe de um agente registrado (SPEC-036)',
    node: 'scripts/agent.ts',
    args: ['show'],
    gates: ['workspace-warn'],
  },
  'agent:score': {
    domain: 'code',
    desc: 'Computa e persiste trustLevel/autonomyLevel a partir de Observation reais (SPEC-036)',
    node: 'scripts/agent.ts',
    args: ['score'],
    gates: ['workspace-warn'],
  },
  'agent:history': {
    domain: 'code',
    desc: 'Observations de um agente, mais recentes primeiro (SPEC-036)',
    node: 'scripts/agent.ts',
    args: ['history'],
    gates: ['workspace-warn'],
  },
  'agent:recommend': {
    domain: 'code',
    desc: 'Ranking de agentes registrados por adequação a um papel/domínio — informação, não atribuição (SPEC-037)',
    node: 'scripts/agent.ts',
    args: ['recommend'],
    gates: ['workspace-warn'],
  },
  'agent:monitor': {
    domain: 'code',
    desc: 'Compara comportamento recente de um agente contra a linha de base histórica — informação, não bloqueio (SPEC-040)',
    node: 'scripts/agent.ts',
    args: ['monitor'],
    gates: ['workspace-warn'],
  },
  'incident:record': {
    domain: 'code',
    desc: 'Grava um incidente no Engineering Graph (SPEC-041)',
    node: 'scripts/incident.ts',
    args: ['record'],
    gates: ['workspace-warn'],
  },
  'incident:list': {
    domain: 'code',
    desc: 'Incidentes registrados, mais recentes primeiro (SPEC-041)',
    node: 'scripts/incident.ts',
    args: ['list'],
    gates: ['workspace-warn'],
  },
  'incident:similar': {
    domain: 'code',
    desc: 'Sugere incidentes parecidos por palavra-chave — sugestão, nunca aplicação automática (SPEC-041)',
    node: 'scripts/incident.ts',
    args: ['similar'],
    gates: ['workspace-warn'],
  },
  'simulate': {
    domain: 'code',
    desc: 'Testa+arquitetura+risco de um ref num worktree isolado, nunca promove',
    node: 'scripts/simulate.ts',
    gates: ['workspace-warn'],
    spec: 'SPEC-038',
    json: true,
    usage: 'forja simulate <ref> [--command "npm test"] [--json]',
    cliArgs: [{ name: 'ref', required: true, desc: 'git ref a simular' }],
    examples: ['forja simulate HEAD', 'forja simulate HEAD --json'],
  },
  'provenance:record': {
    domain: 'code',
    desc: 'Extrai proveniência (arquivo↔agente) de um RuntimeRun já persistido (SPEC-039)',
    node: 'scripts/provenance.ts',
    args: ['record'],
    gates: ['workspace-warn'],
  },
  'blame': {
    domain: 'code',
    desc: 'Histórico de proveniência de um arquivo — granularidade de arquivo, não linha (SPEC-039)',
    node: 'scripts/provenance.ts',
    args: ['blame'],
    gates: ['workspace-warn'],
  },
  'sbom': {
    domain: 'code',
    desc: 'AI-SBOM: relatório de proveniência agregado por agente (SPEC-039)',
    node: 'scripts/provenance.ts',
    args: ['sbom'],
    gates: ['workspace-warn'],
  },
  'code:context': {
    domain: 'code',
    desc: 'Pacote de contexto mínimo de um domínio: o mapa (context.md), + código com --code (ADR-0009)',
    node: 'scripts/code-context.ts',
  },
  'code:index': {
    domain: 'code',
    desc: 'Inicializa índice codegraph',
    bin: 'codegraph',
    args: ['init'],
  },
  'code:sync': {
    domain: 'code',
    desc: 'Sincroniza índice codegraph',
    bin: 'codegraph',
    args: ['sync'],
  },
  'code:status': {
    domain: 'code',
    desc: 'Status do índice codegraph',
    bin: 'codegraph',
    args: ['status'],
  },
  'code:query': {
    domain: 'code',
    desc: 'Consulta o índice codegraph',
    bin: 'codegraph',
    args: ['query'],
  },

  // --- Memória -----------------------------------------------------------------
  'sync:universal': {
    domain: 'memoria',
    desc: 'Reindexa a memória universal (SQLite FTS5)',
    node: 'scripts/sync-universal-memory.ts',
    gates: ['workspace-warn'],
    tier: 'core',
    usage: 'forja sync:universal',
    examples: ['forja sync:universal'],
    next: ['query:universal'],
  },
  'query:universal': {
    domain: 'memoria',
    desc: 'Busca FTS5 na memória universal',
    node: 'scripts/query-universal-memory.ts',
    gates: ['workspace-warn'],
    tier: 'core',
    readonly: true,
    usage: 'forja query:universal "<termo>"',
    cliArgs: [{ name: 'termo', required: true, desc: 'consulta FTS5 (entre aspas)' }],
    examples: ['forja query:universal "handoff 7 campos"'],
    next: ['context:smart'],
  },
  'memory:compress': {
    domain: 'memoria',
    desc: 'Arquiva runs antigos e compacta memória de projeto',
    node: 'scripts/compress-project-memory.ts',
  },
  'memory:vacuum': {
    domain: 'memoria',
    desc: 'Comprime e limpa memória (archive + VACUUM)',
    node: 'scripts/compress-memory.ts',
  },
  'memory:schema': {
    domain: 'memoria',
    desc: 'Garante schema do SQLite de memória',
    node: 'scripts/memory-schema.ts',
  },
  'memory:extract': {
    domain: 'memoria',
    desc: 'Extrai conhecimento global da memória',
    node: 'scripts/extract-global-knowledge.ts',
  },
  'memory:audit': {
    domain: 'memoria',
    desc: 'Coerência mapa↔código: mapa não cita código morto (falha) + módulo sem mapa (aviso). SPEC-017',
    node: 'scripts/memory-audit.ts',
  },

  // --- Contexto & token economy ---------------------------------------------
  'context:smart': {
    domain: 'contexto',
    desc: 'Gera smart-context (3 modos: global | domain | task)',
    node: 'scripts/build-smart-context.ts',
    gates: ['workspace-warn'],
    spec: 'ADR-0003',
    tier: 'core',
    usage: 'forja context:smart [--mode global|domain|task] [--domain <d>]',
    examples: ['forja context:smart --mode task --domain pagamentos'],
    next: ['context:budget'],
  },
  'context:budget': {
    domain: 'contexto',
    desc: 'Orçamento de tokens do contexto',
    node: 'scripts/context-ops.ts',
    args: ['budget'],
  },
  'context:sprint': {
    domain: 'contexto',
    desc: 'Pacote de contexto da sprint',
    node: 'scripts/context-ops.ts',
    args: ['sprint-pack'],
  },
  'agent:brief': {
    domain: 'contexto',
    desc: 'Brief de contexto para um agente',
    node: 'scripts/context-ops.ts',
    args: ['agent-brief'],
  },
  'catalog:assets': {
    domain: 'contexto',
    desc: 'Catálogo de assets do repo',
    node: 'scripts/context-ops.ts',
    args: ['asset-catalog'],
  },
  'catalog:manifests': {
    domain: 'contexto',
    desc: 'Catálogo de manifests',
    node: 'scripts/context-ops.ts',
    args: ['manifests'],
  },
  'token:benchmark': {
    domain: 'contexto',
    desc: 'Benchmark de consumo de tokens',
    node: 'scripts/token-benchmark.ts',
  },
  'token:economy': {
    domain: 'contexto',
    desc: 'Economia de token: eixos arquitetura + memória; --project mede seus domínios reais',
    node: 'scripts/token-economy.ts',
    spec: 'ADR-0009, ADR-0027',
    json: true,
    usage: 'forja token:economy [--project <path>] [--json]',
    examples: ['forja token:economy', 'forja token:economy --json'],
  },
  'benchmark:context': {
    domain: 'contexto',
    desc: 'Benchmark JSON determinístico de baseline, contexto mínimo, checksum e cache',
    node: 'scripts/context-benchmark.ts',
  },
  'spec:set-status': {
    domain: 'sdd',
    desc: 'Atualiza o status de um artefato SDD',
    node: 'scripts/spec-cli.ts',
    args: ['set-status'],
  },

  // --- LLMs & execução supervisionada -------------------------------------
  'llm:profiles:init': {
    domain: 'llm',
    desc: 'Cria perfis de adapters LLM no workspace',
    node: 'scripts/llm-fit.ts',
    args: ['profiles:init'],
    gates: ['workspace'],
  },
  'llm:doctor': {
    domain: 'llm',
    desc: 'Verifica adapters LLM configurados sem usar credenciais',
    node: 'scripts/llm-fit.ts',
    args: ['doctor'],
    gates: ['workspace'],
  },
  'llm:probe': {
    domain: 'llm',
    desc: 'Executa probe seguro de disponibilidade dos adapters LLM',
    node: 'scripts/llm-fit.ts',
    args: ['probe'],
    gates: ['workspace'],
  },
  'llm:recommend': {
    domain: 'llm',
    desc: 'Recomenda perfil LLM por papel, tarefa e evidência local',
    node: 'scripts/llm-fit.ts',
    args: ['recommend'],
    gates: ['workspace'],
  },
  'llm:run': {
    domain: 'llm',
    desc: 'Executa um perfil LLM e registra observação normalizada. --engineer "<objetivo>" monta o contexto pelo façade',
    node: 'scripts/llm-fit.ts',
    args: ['run'],
    gates: ['workspace'],
  },
  'llm:sessions': {
    domain: 'llm',
    desc: 'Lista/mostra sessões LLM registradas (o SESSION_ID de llm:run --resume) — somente leitura (SPEC-048)',
    node: 'scripts/llm-fit.ts',
    args: ['sessions'],
    gates: ['workspace'],
    readonly: true,
    json: true,
    usage: 'forja llm:sessions <list|show> [id] [--json]',
    examples: ['forja llm:sessions list', 'forja llm:sessions show <id> --json'],
  },
  'llm:eval': {
    domain: 'llm',
    desc: 'Avalia execuções LLM com métricas determinísticas',
    node: 'scripts/llm-fit.ts',
    args: ['eval'],
    gates: ['workspace'],
  },
  'cost:economy': {
    domain: 'llm',
    desc: 'Custo real acumulado (USD) das execuções LLM registradas, por modelo — tabela de preço local',
    node: 'scripts/cost-economy.ts',
    gates: ['workspace'],
    spec: 'SPEC-029',
    json: true,
    usage: 'forja cost:economy [--json]',
    examples: ['forja cost:economy', 'forja cost:economy --json'],
  },

  // --- Governança & qualidade ---------------------------------------------------
  'project:check': {
    domain: 'governanca',
    desc: 'Standards check do framework (pre-commit)',
    node: 'scripts/check-standards.ts',
    tier: 'core',
    readonly: true,
    usage: 'forja project:check',
    examples: ['forja project:check'],
    next: ['check:all'],
  },
  'tools:doctor': {
    domain: 'governanca',
    desc: 'Raio-x do núcleo (gate, exit 1) + ferramentas de processo',
    node: 'scripts/tools-doctor.ts',
    spec: 'ADR-0023, ADR-0018',
    tier: 'core',
    readonly: true,
    json: true,
    usage: 'forja tools:doctor [--json]',
    examples: ['forja tools:doctor', 'forja tools:doctor --json'],
    next: ['setup'],
  },
  'demo:autonomy': {
    domain: 'governanca',
    desc: 'Executa a prova offline de autonomia supervisionada com Git worktree real',
    node: 'scripts/demo-autonomy.ts',
  },
  'demo:workspace': {
    domain: 'governanca',
    desc: 'Cria um workspace isolado e rotulado para demonstração do produto',
    node: 'scripts/demo-workspace.ts',
  },
  'release:check': {
    domain: 'governanca',
    desc: 'Gate do tarball: instala limpo e prova que o pacote funciona (ADR-0024). --publish para o modo estrito',
    node: 'scripts/release-check.ts',
  },
  'project:smoke': {
    domain: 'governanca',
    desc: 'Gate do projeto gerado: gera isolado e prova que é coerente (SPEC-015). --full instala e builda o backend',
    node: 'scripts/project-smoke.ts',
  },
  'check:all': {
    domain: 'governanca',
    desc: 'Roda a bateria inteira de gates e dá um veredito (SPEC-020). --full inclui tarball e build',
    node: 'scripts/gates.ts',
  },
  'project:dashboard': {
    domain: 'governanca',
    desc: 'Gera dashboard estático de status',
    node: 'scripts/generate-dashboard.ts',
  },
  'audit:sync': {
    domain: 'governanca',
    desc: 'Projeta a trilha de auditoria (.jsonl) numa tabela consultável (SPEC-014)',
    node: 'scripts/audit-sync.ts',
  },
  'audit:query': {
    domain: 'governanca',
    desc: 'Consulta a auditoria: --failed, --cmd <x>, --since 7d',
    node: 'scripts/audit-query.ts',
  },
  'governance:dashboard': {
    domain: 'governanca',
    desc: 'Gera um painel HTML estático de governança (gates, SDD, auditoria) — leitura, sem servidor',
    node: 'scripts/governance-dashboard.ts',
  },

  // --- Geração ----------------------------------------------------------------------
  'init:project': {
    domain: 'geracao',
    desc: 'Gera projeto direto num path (prefira project:new)',
    node: 'bin/init-project.ts',
  },
};
