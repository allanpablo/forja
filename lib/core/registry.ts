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
  orchestrate: {
    domain: 'gsd',
    desc: 'Abre uma corrida: a cadeia SDD/GSD como máquina de estados guardada por gates (SPEC-021). "<objetivo>" --slug <slug>',
    node: 'scripts/orchestrate.ts',
    args: ['start'],
  },
  'orchestrate:status': {
    domain: 'gsd',
    desc: 'O estado da corrida: etapas feitas, aberta, gates e vereditos',
    node: 'scripts/orchestrate.ts',
    args: ['status'],
  },
  'orchestrate:advance': {
    domain: 'gsd',
    desc: 'Roda o gate da etapa aberta; verde → abre a próxima; vermelho → trava com o parecer',
    node: 'scripts/orchestrate.ts',
    args: ['advance'],
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
    desc: 'Façade: contexto + ADRs relevantes + architecture:check + risco + fluxo recomendado (SPEC-035)',
    node: 'scripts/engineer.ts',
    gates: ['workspace-warn'],
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
  'memory:audit': {
    domain: 'memoria',
    desc: 'Coerência mapa↔código: mapa não cita código morto (falha) + módulo sem mapa (aviso). SPEC-017',
    node: 'scripts/memory-audit.ts',
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
  'token:economy': {
    domain: 'contexto',
    desc: 'Economia de token: eixos arquitetura + memória; --project mede seus domínios reais (ADR-0009/0027)',
    node: 'scripts/token-economy.ts',
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
    desc: 'Executa um perfil LLM e registra observação normalizada',
    node: 'scripts/llm-fit.ts',
    args: ['run'],
    gates: ['workspace'],
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
    desc: 'Custo real acumulado (USD) das execuções LLM registradas, por modelo — tabela de preço local (SPEC-029)',
    node: 'scripts/cost-economy.ts',
    gates: ['workspace'],
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
