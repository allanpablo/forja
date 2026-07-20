/**
 * lib/agent-topology.ts — a topologia de orquestração é uma só, descrita em três lugares (SPEC-019).
 *
 * O nome do framework é orquestração multiagente, e quem-orquestra-quem vive em três fontes que podem
 * divergir em silêncio:
 *
 *   1. `scripts/agent-router.ts` (`VALID_AGENTS`) — para quem um handoff pode ser roteado.
 *   2. `.claude/agents/*.md` — os sub-agents executáveis (quem faz o trabalho).
 *   3. `AGENTS.md` — a prosa que documenta os papéis.
 *
 * Este módulo extrai as três e aponta onde não concordam. É o `adr-refs` da orquestração.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface TopologyEnv {
  fs: typeof fs;
  root: string;
}

/**
 * Endpoints de handoff que NÃO são sub-agents especialistas e por isso não têm `.claude/agent`:
 *   - `user`   — o humano.
 *   - `worker` — o agente implementador principal (o Claude que executa), não um especialista spawnado.
 */
export const ENDPOINTS = new Set(['user', 'worker']);

/** Os agentes para os quais o router aceita rotear (`VALID_AGENTS` de agent-router.ts). */
export function routerAgents(env: TopologyEnv): string[] {
  try {
    const src = env.fs.readFileSync(path.join(env.root, 'scripts', 'agent-router.ts'), 'utf8');
    const m = src.match(/VALID_AGENTS\s*=\s*\[([^\]]*)\]/);
    if (!m) return [];
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  } catch {
    return [];
  }
}

/** Os sub-agents executáveis: os arquivos `.claude/agents/*.md` (menos README). */
export function subAgents(env: TopologyEnv): string[] {
  try {
    return env.fs
      .readdirSync(path.join(env.root, '.claude', 'agents'))
      .filter((f: string) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
      .map((f: string) => f.replace(/\.md$/, ''))
      .sort();
  } catch {
    return [];
  }
}

/** True se `name` é citado no AGENTS.md (documentado na prosa da topologia). */
export function documentedInAgentsMd(env: TopologyEnv, name: string): boolean {
  try {
    const src = env.fs.readFileSync(path.join(env.root, 'AGENTS.md'), 'utf8').toLowerCase();
    // Casa o nome exato como palavra (sdd-architect, context-engineer, release-auditor).
    return new RegExp(`\\b${name.replace(/[-]/g, '[- ]')}\\b`).test(src);
  } catch {
    return false;
  }
}

export interface TopologyIssues {
  /** Sub-agent executável que o router não conhece — implementação que a orquestração não alcança. */
  unrouted: string[];
  /** Papel roteável (não-endpoint) sem `.claude/agent` — o router promete um destino sem executor. */
  missingExecutor: string[];
  /** Sub-agent não citado no AGENTS.md — implementação sem documentação na topologia. */
  undocumented: string[];
}

export function topologyIssues(env: TopologyEnv): TopologyIssues {
  const router = new Set(routerAgents(env));
  const agents = subAgents(env);
  const agentSet = new Set(agents);

  const unrouted = agents.filter((a) => !router.has(a) && !ENDPOINTS.has(a));
  const missingExecutor = [...router].filter((r) => !ENDPOINTS.has(r) && !agentSet.has(r));
  const undocumented = agents.filter((a) => !ENDPOINTS.has(a) && !documentedInAgentsMd(env, a));

  return { unrouted, missingExecutor, undocumented };
}
