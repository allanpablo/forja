/**
 * lib/core/registry.mjs
 *
 * Registry declarativo do core Forja (ADR-0020).
 * Cada comando declara: domínio, descrição, alvo de execução e gates.
 *
 * Alvos:
 *   - node: script do repo executado com `node <script> [...args]`
 *   - bin:  binário externo no PATH (ex.: codegraph)
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
export function resolveScript(root, node) {
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
  governanca: 'Governança & qualidade',
  geracao: 'Geração de projetos',
};

export const COMMANDS = {
  // --- Workspace & projetos ---------------------------------------------
  'workspace:init': {
    domain: 'workspace',
    desc: 'Cria a estrutura base do workspace (~/forja-workspace)',
    node: 'scripts/agent-harness.ts',
    args: ['workspace:init'],
  },
  'project:new': {
    domain: 'workspace',
    desc: 'Cria projeto no workspace e registra ficha em 30-projects/',
    node: 'scripts/agent-harness.ts',
    args: ['project:new'],
    gates: ['workspace'],
  },
  'project:list': {
    domain: 'workspace',
    desc: 'Lista projetos do workspace',
    node: 'scripts/agent-harness.ts',
    args: ['project:list'],
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
  },
  'spec:plan': {
    domain: 'sdd',
    desc: 'Deriva plan.md de uma spec',
    node: 'scripts/spec-cli.ts',
    args: ['plan'],
  },
  'spec:tasks': {
    domain: 'sdd',
    desc: 'Decompõe plan.md em tasks.md',
    node: 'scripts/spec-cli.ts',
    args: ['tasks'],
  },
  'spec:check': {
    domain: 'sdd',
    desc: 'Valida completude da spec (gate de governança)',
    node: 'scripts/spec-cli.ts',
    args: ['check'],
  },

  // --- GSD & handoffs ------------------------------------------------------
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
  },
  'query:universal': {
    domain: 'memoria',
    desc: 'Busca FTS5 na memória universal',
    node: 'scripts/query-universal-memory.ts',
    gates: ['workspace-warn'],
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

  // --- Contexto & token economy ---------------------------------------------
  'context:smart': {
    domain: 'contexto',
    desc: 'Gera smart-context (3 modos, ADR-0003)',
    node: 'scripts/build-smart-context.ts',
    gates: ['workspace-warn'],
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

  // --- Governança & qualidade ---------------------------------------------------
  'project:check': {
    domain: 'governanca',
    desc: 'Standards check do framework (pre-commit)',
    node: 'scripts/check-standards.ts',
  },
  'tools:doctor': {
    domain: 'governanca',
    desc: 'Raio-x do núcleo (gate, exit 1) + ferramentas de processo (ADR-0023, ADR-0018)',
    node: 'scripts/tools-doctor.ts',
  },
  'release:check': {
    domain: 'governanca',
    desc: 'Gate do tarball: instala limpo e prova que o pacote funciona (ADR-0024). --publish para o modo estrito',
    node: 'scripts/release-check.ts',
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
