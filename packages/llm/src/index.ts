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

export function buildLlmExecution(profile: LlmProfile, prompt: string, options: LlmExecutionOptions = {}): LlmExecution {
  validateProfile('execution', profile);
  if (!profile.enabled) throw new LlmProfileError('profile is disabled');
  if (prompt.trim().length === 0) throw new LlmProfileError('prompt is required');
  if (options.resume !== undefined && (profile.provider !== 'codex' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(options.resume))) {
    throw new LlmProfileError('resume requires codex and an explicit session ID');
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
  if (profile.provider === 'claude') return { executable: profile.command, args: [...base, ...(profile.model === 'default' ? [] : ['--model', profile.model]), '-p', prompt] };
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

export function recommendProfile(profiles: LlmProfiles, observations: readonly { readonly model?: string; readonly outcome: string; readonly durationMs: number; readonly cost?: number }[], role: string, taskType: string, privacy?: LlmProfile['privacy']): readonly { readonly name: string; readonly score: number; readonly reasons: readonly string[] }[] {
  return Object.entries(profiles.profiles)
    .filter(([, profile]) => profile.enabled && (privacy === undefined || profile.privacy === privacy))
    .map(([name, profile]) => {
      const model = `${profile.provider}:${profile.model}`;
      const samples = observations.filter((value) => value.model === model);
      const succeeded = samples.filter((value) => value.outcome === 'succeeded').length;
      const successRate = samples.length === 0 ? 0 : succeeded / samples.length;
      const score = (profile.roles.includes(role) ? 100 : 0) + (profile.taskTypes.includes(taskType) ? 50 : 0) + Math.round(successRate * 25) + Math.min(samples.length, 10);
      const reasons = [
        ...(profile.roles.includes(role) ? [`role:${role}`] : []),
        ...(profile.taskTypes.includes(taskType) ? [`task:${taskType}`] : []),
        ...(samples.length > 0 ? [`${succeeded}/${samples.length} successful runs`] : ['no local evidence yet']),
      ];
      return { name, score, reasons };
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
