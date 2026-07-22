/**
 * lib/orchestrate.ts — o motor de orquestração: a cadeia de handoffs como máquina de estados
 * (SPEC-021, ADR-0031).
 *
 * O framework NÃO executa o trabalho de cada etapa — quem faz é o agente (IA ou humano) que pega o
 * handoff aberto. O que o motor faz, e nada mais: decompõe o objetivo na cadeia SDD/GSD, abre a
 * etapa certa, e **só avança quando o gate da etapa passa**. A etapa que tenta pular fica bloqueada
 * pela máquina, não pela memória de alguém. O framework orquestra e guarda; o agente executa.
 *
 * Estado em `<cwd>/.context/orchestrate-<slug>.json` — ao lado dos runbooks GSD, versionável se o
 * projeto quiser. Cada transição também vira handoff ADR-0005 (via agent-router) e linha de
 * auditoria (via o dispatcher). A corrida inteira é reconstruível.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface OrchestrateEnv {
  fs: typeof fs;
}
const defaultEnv: OrchestrateEnv = { fs };

export interface Stage {
  id: string;
  owner: string;
  /** O que o dono faz nesta etapa (vai no handoff). */
  work: string;
  /** intent do handoff (ADR-0005): implement | review | plan | research. */
  intent: 'implement' | 'review' | 'plan' | 'research';
  /** argv do `forja` que guarda a transição — a etapa só fecha se este comando sair 0. */
  gate: string[];
  /**
   * Artefato SDD que a etapa produz (`specs/<slug>/<artifact>.md`), exigido aprovado além do gate.
   * Sem isto, `spec:check` deixaria a etapa `plan` avançar SEM plan.md — ausência não é incoerência
   * para o check, mas é trabalho não feito para a máquina (furo achado no test-drive da SPEC-021).
   */
  artifact?: 'spec' | 'plan' | 'tasks';
}

/**
 * A cadeia v1: o pipeline SDD/GSD, determinística de propósito (decisão 3 da SPEC-021). Cada
 * transição tem dono e gate; a topologia dos donos é a que o `agent-topology` mantém coerente.
 */
export function chainFor(slug: string): Stage[] {
  return [
    { id: 'spec', owner: 'product', intent: 'plan', work: `escrever/aprovar specs/${slug}/spec.md`, gate: ['spec:check', slug], artifact: 'spec' },
    { id: 'plan', owner: 'sdd-architect', intent: 'plan', work: `escrever/aprovar specs/${slug}/plan.md`, gate: ['spec:check', slug], artifact: 'plan' },
    { id: 'tasks', owner: 'sdd-architect', intent: 'plan', work: `decompor specs/${slug}/tasks.md`, gate: ['spec:check', slug], artifact: 'tasks' },
    { id: 'implement', owner: 'worker', intent: 'implement', work: 'implementar as tasks com verde contínuo', gate: ['project:check'] },
    { id: 'review', owner: 'governance', intent: 'review', work: 'revisar a entrega contra os ACs', gate: ['check:all'] },
  ];
}

export interface StageState {
  id: string;
  owner: string;
  gate: string;
  status: 'pending' | 'open' | 'done';
  verdict?: string;
  closedAt?: string;
}

export interface RunState {
  slug: string;
  goal: string;
  createdAt: string;
  /** Índice da etapa aberta; === stages.length quando a corrida terminou. */
  current: number;
  stages: StageState[];
}

export function statePath(root: string, slug: string): string {
  return path.join(root, '.context', `orchestrate-${slug}.json`);
}

export function loadState(root: string, slug: string, env: OrchestrateEnv = defaultEnv): RunState | null {
  try {
    return JSON.parse(env.fs.readFileSync(statePath(root, slug), 'utf8'));
  } catch {
    return null;
  }
}

function saveState(root: string, state: RunState, env: OrchestrateEnv): void {
  const file = statePath(root, state.slug);
  env.fs.mkdirSync(path.dirname(file), { recursive: true });
  env.fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
}

/** Abre uma corrida: a cadeia inteira `pending`, a primeira etapa `open`. Recusa sobrescrever. */
export function startRun(
  { root, slug, goal }: { root: string; slug: string; goal: string },
  env: OrchestrateEnv = defaultEnv
): RunState {
  if (loadState(root, slug, env)) {
    throw new Error(`já existe uma corrida para "${slug}" — veja orchestrate:status ${slug}`);
  }
  const stages = chainFor(slug).map((s, i): StageState => ({
    id: s.id,
    owner: s.owner,
    gate: s.gate.join(' '),
    status: i === 0 ? 'open' : 'pending',
  }));
  const state: RunState = { slug, goal, createdAt: new Date().toISOString(), current: 0, stages };
  saveState(root, state, env);
  return state;
}


const STATUS_RE = /-\s*\*\*Status\*\*:\s*([a-z]+)/i;
const READY_STATUSES = new Set(['approved', 'implementing', 'done']);

/** O artefato existe e está aprovado? A máquina exige o trabalho, não só a coerência. */
export function artifactReady(
  root: string,
  slug: string,
  artifact: string,
  env: OrchestrateEnv = defaultEnv
): { ok: boolean; reason: string } {
  const file = path.join(root, 'specs', slug, `${artifact}.md`);
  let src: string;
  try {
    src = env.fs.readFileSync(file, 'utf8');
  } catch {
    return { ok: false, reason: `specs/${slug}/${artifact}.md não existe — a etapa não foi feita` };
  }
  const m = src.match(STATUS_RE);
  const status = m ? m[1].toLowerCase() : 'unknown';
  if (!READY_STATUSES.has(status)) {
    return { ok: false, reason: `specs/${slug}/${artifact}.md está "${status}" — precisa de approved` };
  }
  return { ok: true, reason: `${artifact}.md ${status}` };
}

export interface AdvanceResult {
  advanced: boolean;
  /** A etapa que o gate avaliou. */
  stage: StageState;
  /** A próxima etapa aberta (null quando a corrida terminou ou o gate reprovou). */
  next: StageState | null;
  finished: boolean;
  gateOutput: string;
}

/**
 * O coração do motor: roda o gate da etapa aberta. Verde → fecha a etapa e abre a próxima.
 * Vermelho → a corrida fica onde está, com o parecer gravado. `runGate` é injetado — o motor não
 * sabe COMO o gate roda, só que devolve exit code e saída (testável sem spawnar nada).
 */
export function advance(
  {
    root,
    slug,
    runGate,
  }: { root: string; slug: string; runGate: (gateArgv: string[]) => { code: number; output: string } },
  env: OrchestrateEnv = defaultEnv
): AdvanceResult {
  const state = loadState(root, slug, env);
  if (!state) throw new Error(`nenhuma corrida para "${slug}" — comece com: forja orchestrate "<objetivo>" --slug ${slug}`);
  if (state.current >= state.stages.length) {
    return { advanced: false, stage: state.stages[state.stages.length - 1], next: null, finished: true, gateOutput: '' };
  }

  const chain = chainFor(slug);
  const stage = state.stages[state.current];
  const def = chain[state.current];

  // O artefato da etapa vem ANTES do gate: sem specs/<slug>/<artifact>.md aprovado, o trabalho não
  // foi feito — não importa o que o check de coerência diga.
  if (def.artifact) {
    const ready = artifactReady(root, slug, def.artifact, env);
    if (!ready.ok) {
      stage.verdict = ready.reason;
      saveState(root, state, env);
      return { advanced: false, stage, next: null, finished: false, gateOutput: ready.reason };
    }
  }

  const res = runGate(def.gate);

  if (res.code !== 0) {
    stage.verdict = `gate reprovou (exit ${res.code})`;
    saveState(root, state, env);
    return { advanced: false, stage, next: null, finished: false, gateOutput: res.output };
  }

  stage.status = 'done';
  stage.verdict = 'gate verde';
  stage.closedAt = new Date().toISOString();
  state.current += 1;

  let next: StageState | null = null;
  if (state.current < state.stages.length) {
    next = state.stages[state.current];
    next.status = 'open';
  }
  saveState(root, state, env);
  return { advanced: true, stage, next, finished: next == null, gateOutput: res.output };
}

/** O handoff ADR-0005 da etapa — quem abre a etapa entrega este payload ao agent-router. */
export function handoffFor(slug: string, goal: string, stageIndex: number): Record<string, string> {
  const chain = chainFor(slug);
  const s = chain[stageIndex];
  return {
    from: 'orchestrator',
    to: s.owner,
    intent: s.intent,
    context: `orchestrate ${slug} — objetivo: ${goal}. Etapa ${s.id}: specs/${slug}/, .context/orchestrate-${slug}.json`,
    acceptance: `gate da etapa verde: forja ${s.gate.join(' ')}`,
    constraints: `só a etapa ${s.id}; a máquina não avança sem o gate (SPEC-021)`,
    return: `feito o trabalho, rode: forja orchestrate:advance ${slug}`,
    spec_slug: slug,
  };
}
