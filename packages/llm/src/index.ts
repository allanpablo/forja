import { spawn } from 'node:child_process';

export const LLM_PROFILE_VERSION = 1;

export interface LlmProfile {
  readonly provider: string;
  readonly model: string;
  readonly command: string;
  readonly commandArgs?: readonly string[];
  readonly roles: readonly string[];
  readonly taskTypes: readonly string[];
  readonly privacy: 'local' | 'external';
  readonly enabled: boolean;
  readonly timeoutMs?: number;
  readonly reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface LlmProfiles {
  readonly version: typeof LLM_PROFILE_VERSION;
  readonly profiles: Readonly<Record<string, LlmProfile>>;
}

export interface LlmExecution {
  readonly executable: string;
  readonly args: readonly string[];
  readonly stdin?: string;
}

export interface LlmExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly errorCode?: string;
}

export const DEFAULT_LLM_PROFILES: LlmProfiles = {
  version: LLM_PROFILE_VERSION,
  profiles: {
    codex: { provider: 'codex', model: 'default', command: 'codex', roles: ['orchestrator', 'worker'], taskTypes: ['orchestration', 'implementation', 'review'], privacy: 'external', enabled: true },
    claude: { provider: 'claude', model: 'default', command: 'claude', roles: ['sdd-architect', 'product'], taskTypes: ['architecture', 'specification', 'analysis'], privacy: 'external', enabled: true },
    gemini: { provider: 'gemini-cli', model: 'default', command: 'gemini', roles: ['context-engineer', 'marketing'], taskTypes: ['research', 'context', 'writing'], privacy: 'external', enabled: true },
    ollama: { provider: 'ollama', model: 'llama3.3', command: 'ollama', roles: [], taskTypes: ['offline', 'sensitive'], privacy: 'local', enabled: false },
  },
};

export class LlmProfileError extends Error {
  constructor(message: string) { super(message); this.name = 'LlmProfileError'; }
}

export function validateProfiles(value: unknown): LlmProfiles {
  if (!isRecord(value) || value.version !== LLM_PROFILE_VERSION || !isRecord(value.profiles)) throw new LlmProfileError(`profiles must use version ${LLM_PROFILE_VERSION}`);
  const profiles: Record<string, LlmProfile> = {};
  for (const [name, profile] of Object.entries(value.profiles)) profiles[name] = validateProfile(name, profile);
  return { version: LLM_PROFILE_VERSION, profiles };
}

export interface LlmExecutionOptions {
  readonly resume?: string;
  readonly outputSchema?: string;
}

/**
 * Provedores cujo adaptador suporta retomada de sessão (ADR-0081, ADR-0085). É propriedade do
 * adaptador — o que a CLI do provedor oferece — não uma escolha do operador no perfil.
 */
export const RESUME_PROVIDERS: ReadonlySet<string> = new Set(['codex', 'claude']);

export function buildLlmExecution(profile: LlmProfile, prompt: string, options: LlmExecutionOptions = {}): LlmExecution {
  validateProfile('execution', profile);
  if (!profile.enabled) throw new LlmProfileError('profile is disabled');
  if (prompt.trim().length === 0) throw new LlmProfileError('prompt is required');
  if (options.resume !== undefined && (!RESUME_PROVIDERS.has(profile.provider) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(options.resume))) {
    throw new LlmProfileError('resume requires a resume-capable adapter (codex, claude) and an explicit session ID');
  }
  const base = [...(profile.commandArgs ?? [])];
  if (profile.provider === 'codex') return {
    executable: profile.command,
    args: ['exec', ...base, '--sandbox', 'read-only', '-c', 'approval_policy="never"',
      ...(options.resume ? ['resume', '-c', 'sandbox_mode="read-only"', '-c', 'approval_policy="never"'] : []),
      ...(profile.model === 'default' ? [] : ['--model', profile.model]),
      ...(profile.reasoningEffort ? ['-c', `model_reasoning_effort="${profile.reasoningEffort}"`] : []),
      ...(options.outputSchema ? ['--output-schema', options.outputSchema] : []),
      '--json', ...(options.resume ? [options.resume] : []), '-'],
    stdin: prompt,
  };
  if (profile.provider === 'claude') return {
    executable: profile.command,
    args: [...base, ...(profile.model === 'default' ? [] : ['--model', profile.model]), '-p', prompt,
      '--output-format', 'json', ...(options.resume ? ['--resume', options.resume] : [])],
  };
  if (profile.provider === 'gemini-cli') return { executable: profile.command, args: [...base, ...(profile.model === 'default' ? [] : ['-m', profile.model]), '-p', prompt] };
  if (profile.provider === 'ollama') return { executable: profile.command, args: [...base, 'run', profile.model, prompt] };
  if (profile.provider === 'copilot') return { executable: profile.command, args: [...base, 'copilot', 'suggest', '-t', 'shell', prompt] };
  return { executable: profile.command, args: [...base, prompt] };
}

/** Grace period after SIGTERM before a timed-out LLM subprocess (and anything it spawned) gets SIGKILLed. */
const SIGTERM_GRACE_MS = 3_000;

export async function runLlm(execution: LlmExecution, cwd: string, timeoutMs = 120_000): Promise<LlmExecutionResult> {
  validateTimeout(timeoutMs);
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: Omit<LlmExecutionResult, 'durationMs'>) => {
      if (settled) return;
      settled = true;
      resolve({ ...result, durationMs: Date.now() - started });
    };
    // detached so the child leads its own process group: a negative pid targets the whole group,
    // reaching grandchildren the CLI tool itself spawned (not just the immediate child).
    const child = spawn(execution.executable, execution.args, { cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    // A provider can close stdin early (e.g. invalid configuration). Its exit status is authoritative.
    child.stdin.on('error', () => {});
    child.stdin.end(execution.stdin);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });

    const killGroup = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        // no process group (platform didn't support detached, or it's already gone) — fall back to the child alone
        try { child.kill(signal); } catch { /* already dead */ }
      }
    };

    let killTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      killGroup('SIGTERM');
      killTimer = setTimeout(() => killGroup('SIGKILL'), SIGTERM_GRACE_MS);
      finish({ exitCode: 124, stdout, stderr, errorCode: 'TIMEOUT' });
    }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); clearTimeout(killTimer); finish({ exitCode: 127, stdout, stderr: `${stderr}${error.message}`, errorCode: 'SPAWN_FAILED' }); });
    child.on('close', (code) => { clearTimeout(timer); clearTimeout(killTimer); finish({ exitCode: code ?? 1, stdout, stderr, ...(code === 0 ? {} : { errorCode: 'COMMAND_FAILED' }) }); });
  });
}

interface RecommendObservation { readonly model?: string; readonly outcome: string; readonly durationMs: number; readonly cost?: number }

export interface ProfileRecommendation {
  readonly name: string;
  readonly score: number;
  readonly reasons: readonly string[];
  /** SPEC-049 — a base numérica da recomendação, para o operador ponderar/contestar. */
  readonly evidence: {
    readonly samples: number;
    readonly medianDurationMs: number;
    readonly meanCostUsd: number | null;
    readonly successRate: number;
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * SPEC-049 — recomendação por fit declarado + evidência local, agora ponderando **latência** e
 * **custo**. Os bônus de latência/custo somam no máximo 8 pontos: refinam entre pares próximos,
 * nunca invertem um fit declarado (que vale 100+50). Nenhum percentual de ganho é afirmado —
 * `evidence` expõe a base para o operador julgar.
 */
export function recommendProfile(profiles: LlmProfiles, observations: readonly RecommendObservation[], role: string, taskType: string, privacy?: LlmProfile['privacy']): readonly ProfileRecommendation[] {
  const allDurations = observations.filter((value) => value.model !== undefined).map((value) => value.durationMs);
  const definedCosts = observations.map((value) => value.cost).filter((value): value is number => typeof value === 'number');
  const cohortMedianLatency = median(allDurations);
  const cohortMeanCost = definedCosts.length === 0 ? null : definedCosts.reduce((sum, value) => sum + value, 0) / definedCosts.length;

  return Object.entries(profiles.profiles)
    .filter(([, profile]) => profile.enabled && (privacy === undefined || profile.privacy === privacy))
    .map(([name, profile]): ProfileRecommendation => {
      const model = `${profile.provider}:${profile.model}`;
      const samples = observations.filter((value) => value.model === model);
      const succeeded = samples.filter((value) => value.outcome === 'succeeded').length;
      const successRate = samples.length === 0 ? 0 : succeeded / samples.length;

      const medianDurationMs = median(samples.map((value) => value.durationMs));
      const sampleCosts = samples.map((value) => value.cost).filter((value): value is number => typeof value === 'number');
      const meanCostUsd = sampleCosts.length === 0 ? null : sampleCosts.reduce((sum, value) => sum + value, 0) / sampleCosts.length;

      let latencyBonus = 0;
      let costBonus = 0;
      if (samples.length > 0) {
        if (cohortMedianLatency > 0 && medianDurationMs < cohortMedianLatency) {
          latencyBonus = Math.min(4, Math.round(4 * (1 - medianDurationMs / cohortMedianLatency)));
        }
        if (cohortMeanCost !== null && cohortMeanCost > 0 && meanCostUsd !== null && meanCostUsd < cohortMeanCost) {
          costBonus = Math.min(4, Math.round(4 * (1 - meanCostUsd / cohortMeanCost)));
        }
      }

      const score = (profile.roles.includes(role) ? 100 : 0)
        + (profile.taskTypes.includes(taskType) ? 50 : 0)
        + Math.round(successRate * 25)
        + Math.min(samples.length, 10)
        + latencyBonus
        + costBonus;

      const reasons = [
        ...(profile.roles.includes(role) ? [`role:${role}`] : []),
        ...(profile.taskTypes.includes(taskType) ? [`task:${taskType}`] : []),
        ...(samples.length > 0 ? [`${succeeded}/${samples.length} successful runs`] : ['no local evidence yet']),
        ...(samples.length > 0 ? [`latency:p50=${Math.round(medianDurationMs)}ms`] : []),
        ...(meanCostUsd !== null ? [`cost:$${meanCostUsd.toFixed(4)}/run`] : []),
      ];

      return { name, score, reasons, evidence: { samples: samples.length, medianDurationMs, meanCostUsd, successRate } };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function validateProfile(name: string, value: unknown): LlmProfile {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name) || !isRecord(value)) throw new LlmProfileError(`invalid profile: ${name}`);
  const provider = string(value.provider, 'provider');
  const model = string(value.model, 'model');
  const command = string(value.command, 'command');
  if (/\s/.test(command)) throw new LlmProfileError(`profile ${name}: command must be one executable; use commandArgs for arguments`);
  const privacy = value.privacy;
  if (privacy !== 'local' && privacy !== 'external') throw new LlmProfileError(`profile ${name}: privacy must be local or external`);
  if (typeof value.enabled !== 'boolean') throw new LlmProfileError(`profile ${name}: enabled must be boolean`);
  if (value.timeoutMs !== undefined) validateTimeout(value.timeoutMs);
  if (value.reasoningEffort !== undefined && (provider !== 'codex' || !['low', 'medium', 'high', 'xhigh', 'max'].includes(value.reasoningEffort as string))) {
    throw new LlmProfileError(`profile ${name}: reasoningEffort requires codex and low|medium|high|xhigh|max`);
  }
  if (value.commandArgs !== undefined && (!Array.isArray(value.commandArgs) || !value.commandArgs.every((arg) => typeof arg === 'string' && arg.length > 0))) {
    throw new LlmProfileError(`profile ${name}: commandArgs must be an array of non-empty strings`);
  }
  // argv is positional: duplicate flags and intentional whitespace must survive validation.
  return { provider, model, command, commandArgs: value.commandArgs as string[] | undefined, roles: strings(value.roles, 'roles'), taskTypes: strings(value.taskTypes, 'taskTypes'), privacy, enabled: value.enabled,
    ...(value.timeoutMs !== undefined ? { timeoutMs: value.timeoutMs as number } : {}),
    ...(value.reasoningEffort !== undefined ? { reasoningEffort: value.reasoningEffort as LlmProfile['reasoningEffort'] } : {}),
  };
}

function validateTimeout(value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new LlmProfileError('timeoutMs must be a positive integer <= 2147483647');
  }
}

function strings(value: unknown, field: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)) throw new LlmProfileError(`${field} must be an array of non-empty strings`);
  return [...new Set(value.map((entry) => entry.trim()))];
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new LlmProfileError(`${field} is required`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
