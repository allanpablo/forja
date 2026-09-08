/**
 * lib/status-model.ts — o modelo de estado que `forja status` e `forja next` compartilham (SPEC-044).
 *
 * `collectStatus` compõe um retrato a partir de coletores que já existem (workspace, sprint,
 * orchestrate, specs, runs, handoffs). Cada coletor falha para `{ available: false, reason }` —
 * a função **nunca lança**. `recommendNext` é pura sobre esse modelo: a escada de prioridade da
 * AC-4, determinística.
 */

import fs from 'node:fs';
import path from 'node:path';

import { getWorkspaceInfo, getWorkspaceContextDir, getWorkspaceDbPath } from './workspace.ts';
import { listSpecs, type SpecEntry } from './specs-index.ts';
import { readSprint, type SprintInfo } from './sprint-index.ts';
import { openHandoffs, type OpenHandoff } from './handoffs-index.ts';
import { listRuns, loadState } from './orchestrate.ts';

export type Sub<T> =
  | { readonly available: true; readonly value: T }
  | { readonly available: false; readonly reason: string };

export interface OrchestrateRun {
  readonly slug: string;
  readonly goal: string;
  /** id da etapa aberta, ou `null` se a corrida terminou. */
  readonly openStage: string | null;
  /** veredito gravado na etapa aberta (`gate reprovou (exit N)`, `plan.md draft`, …), ou `null`. */
  readonly openVerdict: string | null;
  readonly concluded: boolean;
}

export interface RecentRun {
  readonly cmd: string;
  readonly exitCode: number;
  readonly ts: string;
}

export interface StatusModel {
  readonly workspace: {
    readonly root: string;
    readonly source: string;
    readonly exists: boolean;
    readonly memoryIndexed: boolean;
  };
  readonly sprint: Sub<SprintInfo | null>;
  readonly orchestrate: Sub<{ readonly runs: OrchestrateRun[] }>;
  readonly specs: Sub<SpecEntry[]>;
  readonly recentRuns: Sub<RecentRun[]>;
  readonly handoffs: Sub<OpenHandoff[]>;
}

export interface NextAction {
  readonly action: string;
  readonly command: string;
  readonly reason: string;
}

function ok<T>(value: T): Sub<T> {
  return { available: true, value };
}
function unavailable(reason: string): Sub<never> {
  return { available: false, reason };
}
function reasonOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function readRecentRuns(contextDir: string, limit: number): RecentRun[] {
  const file = path.join(contextDir, 'forja-runs.jsonl');
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return [];
  const out: RecentRun[] = [];
  for (const line of raw.split('\n').slice(-limit)) {
    try {
      const e = JSON.parse(line);
      out.push({ cmd: String(e.cmd ?? '?'), exitCode: Number(e.exitCode ?? -1), ts: String(e.ts ?? '') });
    } catch {
      /* linha corrompida: pula */
    }
  }
  return out.reverse(); // mais recente primeiro
}

/**
 * `repoRoot` é a raiz onde vivem `specs/`, `memory/` e `.context/orchestrate-*.json` (o repo do
 * framework, ou um projeto gerado). Workspace e memória são resolvidos internamente.
 */
export async function collectStatus(
  repoRoot: string,
  opts: { runsLimit?: number } = {},
): Promise<StatusModel> {
  const runsLimit = opts.runsLimit ?? 5;

  const wi = getWorkspaceInfo();
  let memoryIndexed = false;
  try {
    memoryIndexed = fs.existsSync(getWorkspaceDbPath());
  } catch {
    memoryIndexed = false;
  }
  const workspace = { root: wi.root, source: wi.source, exists: wi.exists, memoryIndexed };

  let sprint: Sub<SprintInfo | null>;
  try {
    sprint = ok(readSprint(repoRoot));
  } catch (e) {
    sprint = unavailable(reasonOf(e));
  }

  let orchestrate: Sub<{ runs: OrchestrateRun[] }>;
  try {
    const runs = listRuns(repoRoot).map((slug): OrchestrateRun => {
      const st = loadState(repoRoot, slug);
      if (!st) return { slug, goal: '', openStage: null, openVerdict: null, concluded: false };
      const concluded = st.current >= st.stages.length;
      const open = concluded ? null : st.stages[st.current];
      return {
        slug,
        goal: st.goal,
        openStage: open ? open.id : null,
        openVerdict: open?.verdict ?? null,
        concluded,
      };
    });
    orchestrate = ok({ runs });
  } catch (e) {
    orchestrate = unavailable(reasonOf(e));
  }

  let specs: Sub<SpecEntry[]>;
  try {
    specs = ok(listSpecs(repoRoot));
  } catch (e) {
    specs = unavailable(reasonOf(e));
  }

  let recentRuns: Sub<RecentRun[]>;
  try {
    const dir = wi.exists ? getWorkspaceContextDir() : path.join(repoRoot, '.context');
    recentRuns = ok(readRecentRuns(dir, runsLimit));
  } catch (e) {
    recentRuns = unavailable(reasonOf(e));
  }

  let handoffs: Sub<OpenHandoff[]>;
  try {
    handoffs = ok(await openHandoffs());
  } catch (e) {
    handoffs = unavailable(reasonOf(e));
  }

  return { workspace, sprint, orchestrate, specs, recentRuns, handoffs };
}

/**
 * A escada de prioridade da AC-4. Pura, determinística: os ramos são testados na ordem e o
 * primeiro que casa vence — empates são impossíveis por construção.
 */
export function recommendNext(model: StatusModel): NextAction {
  // 1 — workspace ausente
  if (!model.workspace.exists) {
    return {
      action: 'setup',
      command: 'forja setup',
      reason: `workspace não existe em ${model.workspace.root}`,
    };
  }

  // 2 — memória não indexada
  if (!model.workspace.memoryIndexed) {
    return {
      action: 'sync',
      command: 'forja sync:universal',
      reason: 'a memória universal (SQLite) ainda não foi indexada',
    };
  }

  // 3 e 4 — corrida orchestrate aberta
  if (model.orchestrate.available) {
    const open = model.orchestrate.value.runs.find((r) => !r.concluded && r.openStage);
    if (open) {
      const red = open.openVerdict && open.openVerdict !== 'gate verde';
      return {
        action: 'orchestrate:advance',
        command: `forja orchestrate:advance ${open.slug}`,
        reason: red
          ? `corrida "${open.slug}" travada na etapa ${open.openStage}: ${open.openVerdict} — corrija e reavance`
          : `corrida "${open.slug}" na etapa ${open.openStage} — feito o trabalho, rode o gate`,
      };
    }
  }

  // 5 e 6 — specs pendentes
  if (model.specs.available) {
    const specs = model.specs.value;

    const needPlan = specs.find((s) => s.status === 'approved' && s.plan !== 'approved');
    if (needPlan) {
      return {
        action: 'spec:plan',
        command: `forja spec:plan ${needPlan.slug}`,
        reason: `spec "${needPlan.slug}" aprovada, plan.md ainda não aprovado`,
      };
    }

    const needTasks = specs.find(
      (s) => s.plan === 'approved' && s.tasks !== 'approved' && s.status !== 'done',
    );
    if (needTasks) {
      return {
        action: 'spec:tasks',
        command: `forja spec:tasks ${needTasks.slug}`,
        reason: `plan de "${needTasks.slug}" aprovado, tasks.md ainda não aprovado`,
      };
    }

    const implementing = specs.find((s) => s.status === 'implementing');
    if (implementing) {
      return {
        action: 'spec:check',
        command: `forja spec:check ${implementing.slug}`,
        reason: `spec "${implementing.slug}" em implementação — valide os ACs com spec:check e a bateria`,
      };
    }
  }

  // 7 — nada pendente
  return {
    action: 'orchestrate',
    command: 'forja orchestrate "<objetivo>" --slug <slug>',
    reason: 'nenhuma pendência detectada — abra uma corrida, ou `forja spec:new <slug>` para uma feature nova',
  };
}
