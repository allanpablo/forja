/**
 * lib/agent-evals.ts — avaliações com agentes reais em projeto descartável (SPEC-054, ADR-0093).
 *
 * Cada caso é um dado (`templates/evals/agents/*.json`): prompt, semente e checks determinísticos.
 * O runner cria workspace e projeto num diretório temporário, aplica a semente, roda o agente
 * (Claude Code ou Codex) com escrita confinada a esses diretórios e corrige pelo que ficou no disco,
 * pelos comandos executados e pela resposta. Nunca roda no projeto do usuário.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { traceSpecs } from './spec-trace.ts';

// ─── Casos e checks ────────────────────────────────────────────────────────────

export type Check =
  | { type: 'file'; desc: string; glob: string; contains?: string[]; exclude?: string[] }
  | { type: 'answer'; desc: string; matches: string[] }
  | { type: 'ran'; desc: string; matches: string }
  | { type: 'criterion'; desc: string; spec: string; ac: string }
  | { type: 'command'; desc: string; run: string; expectExit?: number }
  | { type: 'unchanged'; desc: string; glob: string };

export interface EvalCase {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly seed?: { readonly files?: Readonly<Record<string, string>> };
  readonly checks: readonly Check[];
}

const CHECK_TYPES = new Set(['file', 'answer', 'ran', 'criterion', 'command', 'unchanged']);

export function validateCase(c: any, source = 'caso'): EvalCase {
  const fail = (msg: string) => { throw new Error(`${source}: ${msg}`); };
  if (!c || typeof c !== 'object') fail('não é um objeto');
  if (typeof c.id !== 'string' || !/^[a-z0-9-]+$/.test(c.id)) fail('id ausente ou fora de kebab-case');
  if (typeof c.prompt !== 'string' || !c.prompt.trim()) fail('prompt ausente');
  if (!Array.isArray(c.checks) || !c.checks.length) fail('sem checks');
  for (const k of c.checks) {
    if (!CHECK_TYPES.has(k?.type)) fail(`check de tipo desconhecido: ${k?.type}`);
    if (typeof k.desc !== 'string' || !k.desc) fail(`check ${k.type} sem desc`);
    for (const re of [...(k.contains ?? []), ...(k.matches ? [k.matches].flat() : [])]) {
      try { new RegExp(re); } catch { fail(`regex inválida em "${k.desc}": ${re}`); }
    }
  }
  for (const rel of Object.keys(c.seed?.files ?? {})) {
    if (path.isAbsolute(rel) || rel.split('/').includes('..')) fail(`semente fora do projeto: ${rel}`);
  }
  return { title: c.id, ...c };
}

export function loadCases(dir: string): EvalCase[] {
  return fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()
    .map((n) => validateCase(JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')), n));
}

/** Glob mínimo: `**` atravessa pastas, `*` não; o resto é literal. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') { re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1; }
    else if (ch === '*') re += '[^/]*';
    else re += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Arquivos que o próprio Forja gera durante a sessão (hooks, índice): não contam como mudança do agente. */
const SNAPSHOT_SKIP = new Set(['node_modules', '.git', '.context', '.forja', '.memory']);
/** Índice SQLite (atualizado por query:universal/sync) e checkpoints de sessão (hooks). */
const FORJA_GENERATED = new Set(['memory/sqlite', 'memory/60-runs/sessions']);

export function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (abs: string, rel: string) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (SNAPSHOT_SKIP.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (FORJA_GENERATED.has(r)) continue;
      const p = path.join(abs, e.name);
      if (e.isDirectory()) walk(p, r);
      else if (e.isFile()) out.set(r, crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex'));
    }
  };
  walk(dir, '');
  return out;
}

// ─── Execução do agente ────────────────────────────────────────────────────────

export interface AgentRun {
  readonly answer: string;
  /** Comandos que de fato rodaram (Bash), e ferramentas MCP como `tool:<nome>`. */
  readonly commands: readonly string[];
  readonly costUsd: number | null;
  readonly tokens: { input: number; output: number } | null;
  readonly durationMs: number;
  readonly exitCode: number;
  readonly error?: string;
}

export interface AgentContext {
  readonly projectDir: string;
  readonly workspaceDir: string;
  readonly prompt: string;
  readonly env: NodeJS.ProcessEnv;
  readonly model?: string;
  readonly budgetUsd: number;
  readonly timeoutMs: number;
}

export interface AgentAdapter {
  readonly name: string;
  version(): string | null;
  run(ctx: AgentContext): AgentRun;
}

/** Comandos que o Claude pode rodar sem perguntar. Fora disso, `-p` nega (e o caso mostra). */
export const CLAUDE_ALLOWED_TOOLS = [
  'Read', 'Grep', 'Glob', 'Edit', 'Write', 'MultiEdit', 'mcp__forja',
  'Bash(forja *)', 'Bash(node --test*)', 'Bash(npm test*)', 'Bash(npm run test*)',
  'Bash(ls*)', 'Bash(cat *)', 'Bash(mkdir *)', 'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)',
];

export function parseClaudeStream(stdout: string): Omit<AgentRun, 'durationMs' | 'exitCode'> {
  const events = stdout.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const result = events.find((e: any) => e.type === 'result');
  const denied = new Set<string>((result?.permission_denials ?? []).map((d: any) => d?.tool_use_id).filter(Boolean));
  const commands: string[] = [];
  for (const e of events) {
    if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
    for (const c of e.message.content) {
      if (c?.type !== 'tool_use' || denied.has(c.id)) continue;
      if (c.name === 'Bash' && typeof c.input?.command === 'string') commands.push(c.input.command);
      else if (typeof c.name === 'string' && c.name.startsWith('mcp__')) commands.push(`tool:${c.name}`);
    }
  }
  const u = result?.usage;
  return {
    answer: typeof result?.result === 'string' ? result.result : '',
    commands,
    costUsd: typeof result?.total_cost_usd === 'number' ? result.total_cost_usd : null,
    tokens: u ? { input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0 } : null,
    ...(result ? (result.is_error ? { error: String(result.subtype ?? 'erro') } : {}) : { error: 'sem evento result' }),
  };
}

export function parseCodexJson(stdout: string): Omit<AgentRun, 'durationMs' | 'exitCode'> {
  const events = stdout.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const commands: string[] = [];
  let answer = '';
  let input = 0, output = 0, sawUsage = false, failed: string | undefined;
  for (const e of events) {
    if (e.type === 'item.completed' && e.item?.type === 'command_execution' && typeof e.item.command === 'string') {
      // Codex embrulha em `bash -lc '<cmd>'`.
      const m = e.item.command.match(/^(?:\/\S*\/)?(?:ba)?sh\s+-l?c\s+(['"]?)([\s\S]*)\1$/);
      commands.push(m ? m[2] : e.item.command);
    }
    if (e.type === 'item.completed' && e.item?.type === 'agent_message' && typeof e.item.text === 'string') answer = e.item.text;
    if (e.type === 'turn.completed' && e.usage) {
      sawUsage = true;
      input += (e.usage.input_tokens ?? 0);
      output += (e.usage.output_tokens ?? 0) + (e.usage.reasoning_output_tokens ?? 0);
    }
    if (e.type === 'turn.failed' || e.type === 'error') failed = String(e.error?.message ?? e.message ?? e.type);
  }
  return { answer, commands, costUsd: null, tokens: sawUsage ? { input, output } : null, ...(failed ? { error: failed } : {}) };
}

function timed(bin: string, args: string[], ctx: AgentContext) {
  const t0 = Date.now();
  const r = spawnSync(bin, args, { cwd: ctx.projectDir, env: ctx.env, encoding: 'utf8', timeout: ctx.timeoutMs, input: '', maxBuffer: 256 * 1024 * 1024 });
  const timedOut = r.error && (r.error as any).code === 'ETIMEDOUT';
  return { r, durationMs: Date.now() - t0, timedOut: Boolean(timedOut) };
}

function cliVersion(bin: string): string | null {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 15_000 });
  return r.status === 0 ? (r.stdout || '').trim().split('\n')[0] : null;
}

export const claudeAdapter = (bin = 'claude'): AgentAdapter => ({
  name: 'claude',
  version: () => cliVersion(bin),
  run(ctx) {
    const args = ['-p', ctx.prompt, '--output-format', 'stream-json', '--verbose',
      '--permission-mode', 'acceptEdits', '--add-dir', ctx.workspaceDir,
      '--max-budget-usd', String(ctx.budgetUsd), '--no-session-persistence',
      ...(ctx.model ? ['--model', ctx.model] : []),
      '--allowedTools', ...CLAUDE_ALLOWED_TOOLS];
    const { r, durationMs, timedOut } = timed(bin, args, ctx);
    const parsed = parseClaudeStream(r.stdout || '');
    return { ...parsed, durationMs, exitCode: r.status ?? 1, ...(timedOut ? { error: `timeout (${ctx.timeoutMs} ms)` } : {}) };
  },
});

export const codexAdapter = (bin = 'codex'): AgentAdapter => ({
  name: 'codex',
  version: () => cliVersion(bin),
  run(ctx) {
    const args = ['exec', '--json', '--ephemeral', '--skip-git-repo-check',
      '-s', 'workspace-write', '-C', ctx.projectDir, '--add-dir', ctx.workspaceDir,
      ...(ctx.model ? ['-m', ctx.model] : []), ctx.prompt];
    const { r, durationMs, timedOut } = timed(bin, args, ctx);
    const parsed = parseCodexJson(r.stdout || '');
    return { ...parsed, durationMs, exitCode: r.status ?? 1, ...(timedOut ? { error: `timeout (${ctx.timeoutMs} ms)` } : {}) };
  },
});

export const ADAPTERS: Readonly<Record<string, () => AgentAdapter>> = {
  claude: () => claudeAdapter(process.env.FORJA_EVAL_CLAUDE_BIN || 'claude'),
  codex: () => codexAdapter(process.env.FORJA_EVAL_CODEX_BIN || 'codex'),
};

// ─── Correção ──────────────────────────────────────────────────────────────────

export interface CheckResult { readonly desc: string; readonly type: Check['type']; readonly ok: boolean; readonly detail: string }

const rx = (s: string) => new RegExp(s, 'im');

export function grade(check: Check, projectDir: string, run: AgentRun, before: Map<string, string>, env: NodeJS.ProcessEnv): CheckResult {
  const res = (ok: boolean, detail: string): CheckResult => ({ desc: check.desc, type: check.type, ok, detail });
  switch (check.type) {
    case 'file': {
      const re = globToRegExp(check.glob);
      const ex = (check.exclude ?? []).map(globToRegExp);
      const after = snapshot(projectDir);
      const files = [...after.keys()].filter((f) => re.test(f) && !ex.some((e) => e.test(f)));
      if (!files.length) return res(false, `nenhum arquivo em ${check.glob}`);
      const missing = (f: string) => (check.contains ?? []).filter((c) => !rx(c).test(fs.readFileSync(path.join(projectDir, f), 'utf8')));
      const hit = files.find((f) => missing(f).length === 0);
      return hit ? res(true, hit) : res(false, `${files[0]}: falta ${missing(files[0]).join(', ')}`);
    }
    case 'answer': {
      const miss = check.matches.filter((m) => !rx(m).test(run.answer));
      return miss.length ? res(false, `resposta sem ${miss.join(', ')}`) : res(true, 'resposta confere');
    }
    case 'ran': {
      const hit = run.commands.find((c) => rx(check.matches).test(c));
      return hit ? res(true, hit.slice(0, 120)) : res(false, `nenhum comando casou /${check.matches}/ (${run.commands.length} executados)`);
    }
    case 'criterion': {
      const spec = traceSpecs(projectDir).specs.find((s) => s.slug === check.spec || s.specId === check.spec);
      const c = spec?.criteria.find((x) => x.id === check.ac);
      if (!c) return res(false, `${check.spec} ${check.ac} não existe`);
      return c.tests.length ? res(true, c.tests.map((t) => `${t.file}:${t.line}`).join(', ')) : res(false, 'nenhum teste cita o critério');
    }
    case 'command': {
      const r = spawnSync('sh', ['-c', check.run], { cwd: projectDir, env, encoding: 'utf8', timeout: 120_000 });
      const want = check.expectExit ?? 0;
      const tail = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-2).join(' | ').slice(0, 200);
      return r.status === want ? res(true, `exit ${r.status}`) : res(false, `exit ${r.status} (esperado ${want}): ${tail}`);
    }
    case 'unchanged': {
      const re = globToRegExp(check.glob);
      const after = snapshot(projectDir);
      const keys = new Set([...before.keys(), ...after.keys()].filter((f) => re.test(f)));
      const changed = [...keys].filter((f) => before.get(f) !== after.get(f));
      return changed.length ? res(false, `mudou: ${changed.slice(0, 5).join(', ')}`) : res(true, 'nada mudou');
    }
  }
}

// ─── Suíte ─────────────────────────────────────────────────────────────────────

export interface CaseResult {
  readonly id: string;
  readonly title: string;
  readonly pass: boolean;
  readonly checks: readonly CheckResult[];
  readonly costUsd: number | null;
  readonly durationMs: number;
  readonly commands: number;
  /** Início da resposta final do agente, para diagnosticar a falha sem rodar de novo. */
  readonly answer: string;
  readonly error?: string;
}

export interface SuiteOptions {
  /** Entry point do forja em teste: é o que o agente chama via PATH. */
  readonly forjaBin: string;
  readonly model?: string;
  readonly budgetUsd: number;
  readonly timeoutMs: number;
  readonly keep?: boolean;
  readonly onCase?: (c: EvalCase, r: CaseResult) => void;
}

/** Workspace + projeto descartáveis, com um `forja` no PATH apontando para a instalação em teste. */
export function prepareProject(baseDir: string, name: string, forjaBin: string): { ws: string; proj: string; env: NodeJS.ProcessEnv } {
  const bin = path.join(baseDir, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const shim = path.join(bin, 'forja');
  if (!fs.existsSync(shim)) {
    fs.writeFileSync(shim, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(forjaBin)} "$@"\n`);
    fs.chmodSync(shim, 0o755);
  }
  const ws = path.join(baseDir, 'ws');
  const env: NodeJS.ProcessEnv = { ...process.env, FORJA_WORKSPACE: ws, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` };
  for (const k of Object.keys(env)) if (k.startsWith('npm_')) delete env[k];
  const forja = (args: string[], cwd: string) => {
    const r = spawnSync(process.execPath, [forjaBin, ...args], { cwd, env, encoding: 'utf8', timeout: 180_000 });
    if (r.status !== 0) throw new Error(`forja ${args.join(' ')} falhou: ${`${r.stdout}${r.stderr}`.trim().split('\n').slice(-3).join(' | ')}`);
  };
  if (!fs.existsSync(ws)) forja(['workspace:init'], baseDir);
  forja(['project:new', name, '--ai', 'claude,codex', '--skip-backend'], baseDir);
  return { ws, proj: path.join(ws, 'projects', name), env };
}

const ANSWER_EXCERPT = 400;

export function runCase(c: EvalCase, adapter: AgentAdapter, baseDir: string, opts: SuiteOptions): CaseResult {
  const t0 = Date.now();
  let prepared: ReturnType<typeof prepareProject>;
  try { prepared = prepareProject(baseDir, `caso-${c.id}`, opts.forjaBin); }
  catch (e) { return { id: c.id, title: c.title, pass: false, checks: [], costUsd: null, durationMs: Date.now() - t0, commands: 0, answer: '', error: (e as Error).message }; }
  const { ws, proj, env } = prepared;
  for (const [rel, content] of Object.entries(c.seed?.files ?? {})) {
    fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true });
    fs.writeFileSync(path.join(proj, rel), content);
  }
  spawnSync(process.execPath, [opts.forjaBin, 'sync:universal'], { cwd: proj, env, encoding: 'utf8', timeout: 120_000 });
  const before = snapshot(proj);
  const run = adapter.run({ projectDir: proj, workspaceDir: ws, prompt: c.prompt, env, model: opts.model, budgetUsd: opts.budgetUsd, timeoutMs: opts.timeoutMs });
  const checks = c.checks.map((k) => {
    try { return grade(k, proj, run, before, env); }
    catch (e) { return { desc: k.desc, type: k.type, ok: false, detail: `erro no check: ${(e as Error).message}` }; }
  });
  return {
    id: c.id, title: c.title, pass: checks.every((k) => k.ok) && !run.error, checks,
    costUsd: run.costUsd, durationMs: run.durationMs, commands: run.commands.length,
    answer: run.answer.slice(0, ANSWER_EXCERPT),
    ...(run.error ? { error: run.error } : {}),
  };
}

export interface SuiteResult {
  readonly ts: string;
  readonly agent: string;
  readonly agentVersion: string | null;
  readonly model: string | null;
  readonly forjaVersion: string;
  readonly cases: readonly CaseResult[];
  readonly passed: number;
  readonly costUsd: number | null;
}

export function runSuite(cases: readonly EvalCase[], adapter: AgentAdapter, forjaVersion: string, opts: SuiteOptions): SuiteResult {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `forja-eval-${adapter.name}-`));
  const results: CaseResult[] = [];
  try {
    for (const c of cases) {
      const r = runCase(c, adapter, base, opts);
      results.push(r);
      opts.onCase?.(c, r);
    }
  } finally {
    if (!opts.keep) fs.rmSync(base, { recursive: true, force: true });
  }
  const costs = results.map((r) => r.costUsd).filter((x): x is number => typeof x === 'number');
  return {
    ts: new Date().toISOString(), agent: adapter.name, agentVersion: adapter.version(), model: opts.model ?? null, forjaVersion,
    cases: results, passed: results.filter((r) => r.pass).length,
    costUsd: costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) * 10_000) / 10_000 : null,
  };
}

// ─── Histórico ─────────────────────────────────────────────────────────────────

export function appendHistory(file: string, result: SuiteResult): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(result)}\n`, 'utf8');
}

/** Última execução do mesmo agente e modelo, para comparar. */
export function previousRun(file: string, agent: string, model: string | null): SuiteResult | null {
  let lines: string[] = [];
  try { lines = fs.readFileSync(file, 'utf8').trim().split('\n'); } catch { return null; }
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const r = JSON.parse(lines[i]);
      if (r.agent === agent && (r.model ?? null) === model) return r;
    } catch { /* linha corrompida: ignora */ }
  }
  return null;
}

export function compareRuns(prev: SuiteResult | null, cur: SuiteResult): { regressed: string[]; fixed: string[] } {
  if (!prev) return { regressed: [], fixed: [] };
  const was = new Map(prev.cases.map((c) => [c.id, c.pass]));
  return {
    regressed: cur.cases.filter((c) => was.get(c.id) === true && !c.pass).map((c) => c.id),
    fixed: cur.cases.filter((c) => was.get(c.id) === false && c.pass).map((c) => c.id),
  };
}
