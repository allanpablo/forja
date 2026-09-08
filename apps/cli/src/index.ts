import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  CONTRACT_VERSION,
  type AgentIdentity,
  type CapabilityDefinition,
  type CapabilityId,
  type EntityId,
  type Evidence,
  type ExecutionResult,
  type ISO8601,
} from '../../../packages/contracts/src/index.ts';
import {
  CapabilityRegistry,
  type CapabilityRegistration,
} from '../../../packages/core/src/index.ts';
import { PolicyEngine, type PolicyCategory } from '../../../packages/policy/src/index.ts';
import { COMMANDS, resolveScript } from '../../../lib/core/registry.ts';
import { GraphIndexer, GraphLoop, type GraphDocumentSource } from '../../../packages/graph/src/index.ts';
import { parseArgv, argvFor, makeValidator, type CapabilityParam } from './params.ts';

export interface LegacyCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type LegacyCliRunner = (command: string, args: readonly string[]) => LegacyCliResult | Promise<LegacyCliResult>;

export interface CliExecutionPayload {
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CliCapabilityRuntime {
  readonly registry: CapabilityRegistry;
  readonly policy: PolicyEngine;
  readonly agent: AgentIdentity;
}

export interface GraphSyncComposition {
  readonly graph: GraphLoop;
  readonly source: GraphDocumentSource;
}

export function createLegacyCliRunner(root: string, cwd = process.cwd()): LegacyCliRunner {
  return (command, args) => {
    const definition = (COMMANDS as Record<string, { readonly node?: string; readonly bin?: string; readonly args?: readonly string[] }>)[command];
    if (definition === undefined) return { exitCode: 127, stdout: '', stderr: `Legacy command not found: ${command}` };
    const invocation = definition.node
      ? { command: process.execPath, args: [resolveScript(root, definition.node), ...(definition.args ?? []), ...args] }
      : { command: definition.bin ?? command, args: [...(definition.args ?? []), ...args] };
    const result = spawnSync(invocation.command, invocation.args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { exitCode: result.status ?? 1, stdout: result.stdout ?? '', stderr: [result.stderr ?? '', result.error?.message ?? ''].filter(Boolean).join('\n') };
  };
}

interface InputRecord {
  readonly [key: string]: unknown;
}

interface CliCapabilitySpec<Input extends InputRecord> {
  readonly id: CapabilityId;
  readonly command: string;
  readonly description: string;
  readonly categories: readonly PolicyCategory[];
  readonly permissions: readonly string[];
  readonly risk: 'low' | 'medium' | 'high' | 'critical';
  readonly sideEffects: readonly string[];
  /** argv↔payload declarativo (SPEC-046). `toArgs` e o parse de argv derivam daqui. */
  readonly params: readonly CapabilityParam[];
  /** Opcional: só quando há checagem além de "required + tipo" (range, enum). Default: `makeValidator(params)`. */
  readonly validateInput?: (value: unknown) => Input;
  /** Opcional: `timeoutMs` do registry quando o default de 30s é curto. */
  readonly timeoutMs?: number;
}

export const CLI_CAPABILITY_SPECS: readonly CliCapabilitySpec<InputRecord>[] = [
  // --- Os 6 originais: mesma assinatura, `params` no lugar do `toArgs` manual (SPEC-046) ---
  {
    id: 'system.doctor' as CapabilityId,
    command: 'tools:doctor',
    description: 'Diagnostica o núcleo e as ferramentas opcionais do Forja.',
    categories: ['read'],
    permissions: ['read'],
    risk: 'low',
    sideEffects: [],
    params: [],
    validateInput: emptyInput,
  },
  {
    id: 'code.impact' as CapabilityId,
    command: 'code:impact',
    description: 'Calcula chamadores e blast radius de um símbolo.',
    categories: ['read', 'execution'],
    permissions: ['read'],
    risk: 'low',
    sideEffects: [],
    params: [
      { name: 'symbol', kind: 'positional', required: true },
      { name: 'depth', kind: 'positional', parse: 'int' },
    ],
    validateInput: validateCodeImpactInput,
  },
  {
    id: 'context.budget' as CapabilityId,
    command: 'context:budget',
    description: 'Calcula o orçamento de tokens de um contexto ou runbook.',
    categories: ['read', 'database'],
    permissions: ['read'],
    risk: 'low',
    sideEffects: ['context_run_record'],
    params: [
      { name: 'target', kind: 'positional', required: true },
      { name: 'limitTokens', kind: 'positional', parse: 'int' },
    ],
    validateInput: validateContextBudgetInput,
  },
  {
    id: 'spec.validate' as CapabilityId,
    command: 'spec:check',
    description: 'Valida a estrutura e os estados de uma spec.',
    categories: ['read'],
    permissions: ['read'],
    risk: 'low',
    sideEffects: [],
    params: [{ name: 'feature', kind: 'positional' }],
    validateInput: validateSpecCheckInput,
  },
  {
    id: 'sprint.status' as CapabilityId,
    command: 'sprint:status',
    description: 'Consulta o status da sprint atual.',
    categories: ['read'],
    permissions: ['read'],
    risk: 'low',
    sideEffects: [],
    params: [{ name: 'project', kind: 'positional' }],
    validateInput: validateSprintStatusInput,
  },
  {
    id: 'handoff.create' as CapabilityId,
    command: 'gsd:handoff',
    description: 'Registra um handoff GSD com fase, spec e contexto.',
    categories: ['write', 'database'],
    permissions: ['write'],
    risk: 'low',
    sideEffects: ['handoff_record'],
    params: [
      { name: 'phase', kind: 'positional', required: true },
      { name: 'slug', kind: 'positional', required: true },
      { name: 'context', kind: 'rest' },
    ],
    validateInput: validateHandoffInput,
  },

  // --- SPEC-046 / ADR-0083: o núcleo do fluxo operável por MCP ---
  {
    id: 'spec.create' as CapabilityId,
    command: 'spec:new',
    description: 'Cria specs/<slug>/spec.md a partir do template.',
    categories: ['write'],
    permissions: ['write'],
    risk: 'low',
    sideEffects: ['spec_file'],
    params: [{ name: 'slug', kind: 'positional', required: true }],
  },
  {
    id: 'spec.plan' as CapabilityId,
    command: 'spec:plan',
    description: 'Deriva plan.md de uma spec aprovada.',
    categories: ['write'],
    permissions: ['write'],
    risk: 'low',
    sideEffects: ['spec_file'],
    params: [{ name: 'slug', kind: 'positional', required: true }],
  },
  {
    id: 'spec.tasks' as CapabilityId,
    command: 'spec:tasks',
    description: 'Decompõe plan.md em tasks.md.',
    categories: ['write'],
    permissions: ['write'],
    risk: 'low',
    sideEffects: ['spec_file'],
    params: [{ name: 'slug', kind: 'positional', required: true }],
  },
  {
    id: 'code.context' as CapabilityId,
    command: 'code:context',
    description: 'Pacote de contexto mínimo de um domínio (o mapa; + código com --code).',
    categories: ['read'],
    permissions: ['read'],
    risk: 'low',
    sideEffects: [],
    params: [
      { name: 'domain', kind: 'positional' },
      { name: 'code', kind: 'flag' },
    ],
  },
  {
    id: 'memory.query' as CapabilityId,
    command: 'query:universal',
    description: 'Busca FTS5 na memória universal.',
    categories: ['read', 'database'],
    permissions: ['read'],
    risk: 'low',
    sideEffects: [],
    params: [{ name: 'query', kind: 'positional', required: true }],
  },
  {
    id: 'engineering.facade' as CapabilityId,
    command: 'engineer',
    description: 'Façade: contexto + ADRs relevantes + architecture:check + risco + fluxo recomendado.',
    categories: ['read', 'database', 'execution'],
    permissions: ['read'],
    risk: 'medium',
    sideEffects: [],
    params: [
      { name: 'objective', kind: 'positional', required: true },
      { name: 'ref', kind: 'flag-value', flag: '--ref' },
      { name: 'role', kind: 'flag-value', flag: '--role' },
    ],
    timeoutMs: 120_000,
  },
  {
    id: 'risk.assess' as CapabilityId,
    command: 'risk:assess',
    description: 'Score de risco 0-100 (7 fatores) sobre o diff de um ref.',
    categories: ['read', 'database'],
    permissions: ['read'],
    risk: 'low',
    sideEffects: ['risk_assessment'],
    params: [{ name: 'ref', kind: 'positional' }],
  },
  {
    id: 'orchestrate.status' as CapabilityId,
    command: 'orchestrate:status',
    description: 'O estado de uma corrida orchestrate: etapas, gates, vereditos.',
    categories: ['read'],
    permissions: ['read'],
    risk: 'low',
    sideEffects: [],
    params: [{ name: 'slug', kind: 'positional', required: true }],
  },
  {
    id: 'orchestrate.advance' as CapabilityId,
    command: 'orchestrate:advance',
    description: 'Roda o gate da etapa aberta; verde abre a próxima, vermelho trava com o parecer.',
    categories: ['write', 'execution', 'database'],
    permissions: ['write'],
    risk: 'medium',
    sideEffects: ['orchestrate_state'],
    params: [{ name: 'slug', kind: 'positional', required: true }],
    timeoutMs: 300_000,
  },
  {
    id: 'drift.check' as CapabilityId,
    command: 'drift:check',
    description: 'Reindexa e sinaliza relações verified que a extração atual não reproduz mais.',
    categories: ['read', 'database', 'execution'],
    permissions: ['read'],
    risk: 'medium',
    sideEffects: ['graph_write'],
    params: [{ name: 'domain', kind: 'flag-value', flag: '--domain' }],
    timeoutMs: 120_000,
  },
  {
    id: 'forja.status' as CapabilityId,
    command: 'status',
    description: 'Retrato único do estado: workspace, sprint, corrida, specs, runs, handoffs.',
    categories: ['read'],
    permissions: ['read'],
    risk: 'low',
    sideEffects: [],
    params: [],
  },
  {
    id: 'forja.next' as CapabilityId,
    command: 'next',
    description: 'A próxima ação recomendada e o comando exato para executá-la.',
    categories: ['read'],
    permissions: ['read'],
    risk: 'low',
    sideEffects: [],
    params: [],
  },
];

export const CLI_COMMAND_TO_CAPABILITY: Readonly<Record<string, CapabilityId>> = Object.freeze(
  Object.fromEntries(CLI_CAPABILITY_SPECS.map((spec) => [spec.command, spec.id])) as Record<string, CapabilityId>,
);

/** Interface commands for discovering/executing capabilities; handlers remain in the registry. */
export const CLI_INTERFACE_COMMANDS = Object.freeze([
  'capabilities:list',
  'capabilities:describe',
  'capability:execute',
  'mcp:start',
] as const);

export function createCliCapabilityRuntime(runner: LegacyCliRunner, graphSync?: GraphSyncComposition): CliCapabilityRuntime {
  const registry = new CapabilityRegistry();
  registerCliCapabilities(registry, runner);
  if (graphSync !== undefined) registerGraphSyncCapability(registry, graphSync.graph, graphSync.source);

  const policy = new PolicyEngine({
    rules: [{
      id: 'cli-local-read',
      priority: 10,
      effect: 'ALLOW',
      reason: 'CLI proof capabilities are local analysis operations',
      scope: { roles: ['cli'], environments: ['local'], categories: ['read', 'execution', 'database', 'write'] },
    }],
  });

  return {
    registry,
    policy,
    agent: {
      id: 'agent.cli' as EntityId,
      name: 'Forja CLI',
      role: 'cli',
      autonomy: 'supervised',
    },
  };
}

export function registerCliCapabilities(registry: CapabilityRegistry, runner: LegacyCliRunner): void {
  for (const spec of CLI_CAPABILITY_SPECS) registerCliCapability(registry, runner, spec);
}

export function registerGraphSyncCapability(registry: CapabilityRegistry, graph: GraphLoop, source: GraphDocumentSource): void {
  const now = new Date().toISOString() as ISO8601;
  registry.register({
    definition: { schemaVersion: CONTRACT_VERSION, createdAt: now, updatedAt: now, correlationId: 'graph-capability-catalog', id: 'graph.sync' as CapabilityId, version: '1.0.0', description: 'Indexa arquivos rastreáveis do workspace no GraphLoop por checksum.', permissions: ['write'], risk: 'low', sideEffects: ['graph_write'], requirements: ['git'], supportsAutonomy: true, idempotent: true, timeoutMs: 60_000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [] },
    validateInput: (value) => { if (value === undefined || value === null) return {}; if (!isRecord(value) || Object.keys(value).length > 0) throw new Error('graph.sync input must be an empty object'); return {}; },
    validateOutput: (value) => { if (!isRecord(value) || !['documents', 'indexed', 'skipped', 'nodes', 'edges', 'durationMs'].every((key) => typeof value[key] === 'number') || !Array.isArray(value.files) || !value.files.every((file) => typeof file === 'string')) throw new Error('graph.sync output is invalid'); return value; },
    handler: async () => ({ capabilityId: 'graph.sync' as CapabilityId, payload: await new GraphIndexer(graph).sync(source), evidence: [{ id: randomUUID() as EntityId, source: 'forja.graph', locator: 'graph.sync', capturedAt: new Date().toISOString() as ISO8601, status: 'verified' }] }),
  });
}

export function capabilityIdForCommand(command: string): CapabilityId | undefined {
  return command === 'graph:sync' ? 'graph.sync' as CapabilityId : CLI_COMMAND_TO_CAPABILITY[command];
}

export function parseLegacyCommandInput(command: string, args: readonly string[]): { readonly capabilityId: CapabilityId; readonly payload: InputRecord } {
  // `graph:sync` é o único sem comando CLI / sem params — os demais derivam de `spec.params` (SPEC-046).
  if (command === 'graph:sync') return { capabilityId: 'graph.sync' as CapabilityId, payload: {} };
  const capabilityId = capabilityIdForCommand(command);
  if (capabilityId === undefined) throw new Error(`Command is not migrated to a capability: ${command}`);
  const spec = CLI_CAPABILITY_SPECS.find((s) => s.command === command);
  if (spec === undefined) throw new Error(`No capability spec for command: ${command}`);
  return { capabilityId, payload: parseArgv(spec.params, args) };
}

export async function executeCliCapability(
  runtime: CliCapabilityRuntime,
  capabilityId: CapabilityId,
  payload: unknown,
  correlationId?: string,
): Promise<ExecutionResult> {
  const definition = runtime.registry.describe(capabilityId);
  const categories = categoriesFor(definition.id);
  const result = await runtime.registry.execute({
    input: { capabilityId, payload },
    agent: runtime.agent,
    policy: runtime.policy,
    correlationId,
    environment: 'local',
    categories,
    files: [],
  });
  return normalizeCliResult(result);
}

export function normalizeCliResult(result: ExecutionResult): ExecutionResult {
  if (result.status !== 'succeeded' || result.output === undefined || !isRecord(result.output.payload)) return result;
  const exitCode = result.output.payload.exitCode;
  if (typeof exitCode !== 'number' || exitCode === 0) return result;
  return {
    ...result,
    status: 'failed',
    error: {
      code: 'LEGACY_COMMAND_FAILED',
      message: `Legacy command exited with status ${exitCode}`,
      retryable: false,
    },
  };
}

function registerCliCapability(
  registry: CapabilityRegistry,
  runner: LegacyCliRunner,
  spec: CliCapabilitySpec<InputRecord>,
): void {
  const now = new Date().toISOString() as ISO8601;
  const definition: CapabilityDefinition = {
    schemaVersion: CONTRACT_VERSION,
    createdAt: now,
    updatedAt: now,
    correlationId: 'cli-capability-catalog',
    id: spec.id,
    version: '1.0.0',
    description: spec.description,
    permissions: spec.permissions,
    risk: spec.risk,
    sideEffects: spec.sideEffects,
    requirements: [],
    supportsAutonomy: true,
    idempotent: true,
    timeoutMs: spec.timeoutMs ?? 30_000,
    retry: { maxAttempts: 1, backoffMs: 0 },
    aliases: [spec.command],
  };
  const registration: CapabilityRegistration<InputRecord, CliExecutionPayload> = {
    definition,
    validateInput: spec.validateInput ?? makeValidator(spec.params),
    validateOutput: validateCliPayload,
    handler: async (input) => {
      const args = argvFor(spec.params, input);
      const result = await runner(spec.command, args);
      const capturedAt = new Date().toISOString() as ISO8601;
      const evidence: Evidence = {
        id: randomUUID() as EntityId,
        source: 'forja.cli',
        locator: [spec.command, ...args].join(' '),
        capturedAt,
        status: result.exitCode === 0 ? 'verified' : 'contradicted',
      };
      return {
        capabilityId: spec.id,
        payload: { command: spec.command, args, ...result },
        evidence: [evidence],
      };
    },
  };
  registry.register(registration);
}

function categoriesFor(id: CapabilityId): readonly PolicyCategory[] {
  return CLI_CAPABILITY_SPECS.find((spec) => spec.id === id)?.categories ?? ['read'];
}

function emptyInput(value: unknown): InputRecord {
  if (value === undefined || value === null) return {};
  if (!isRecord(value) || Object.keys(value).length > 0) throw new Error('Input must be an empty object');
  return {};
}

function validateCodeImpactInput(value: unknown): InputRecord {
  const input = requireRecord(value);
  const symbol = input.symbol;
  const depth = input.depth;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) throw new Error('symbol is required');
  if (depth !== undefined && (!Number.isInteger(depth) || (depth as number) < 1 || (depth as number) > 10)) throw new Error('depth must be an integer between 1 and 10');
  return { symbol, ...(depth === undefined ? {} : { depth }) };
}

function validateContextBudgetInput(value: unknown): InputRecord {
  const input = requireRecord(value);
  const target = input.target;
  const limitTokens = input.limitTokens;
  if (typeof target !== 'string' || target.trim().length === 0) throw new Error('target is required');
  if (limitTokens !== undefined && (!Number.isInteger(limitTokens) || (limitTokens as number) < 1)) throw new Error('limitTokens must be a positive integer');
  return { target, ...(limitTokens === undefined ? {} : { limitTokens }) };
}

function validateSpecCheckInput(value: unknown): InputRecord {
  const input = requireRecord(value);
  if (input.feature !== undefined && (typeof input.feature !== 'string' || input.feature.trim().length === 0)) throw new Error('feature must be a non-empty string');
  return input.feature === undefined ? {} : { feature: input.feature };
}

function validateSprintStatusInput(value: unknown): InputRecord {
  const input = requireRecord(value);
  if (input.project !== undefined && (typeof input.project !== 'string' || input.project.trim().length === 0)) throw new Error('project must be a non-empty string');
  return input.project === undefined ? {} : { project: input.project };
}

function validateHandoffInput(value: unknown): InputRecord {
  const input = requireRecord(value);
  if (!['spec', 'plan', 'implement', 'review'].includes(String(input.phase))) throw new Error('phase must be spec, plan, implement or review');
  if (typeof input.slug !== 'string' || input.slug.trim().length === 0) throw new Error('slug is required');
  if (input.context !== undefined && typeof input.context !== 'string') throw new Error('context must be a string');
  return { phase: input.phase, slug: input.slug, ...(input.context === undefined ? {} : { context: input.context }) };
}

function validateCliPayload(value: unknown): CliExecutionPayload {
  const payload = requireRecord(value);
  if (typeof payload.command !== 'string' || !Array.isArray(payload.args) || !payload.args.every((arg) => typeof arg === 'string')) throw new Error('CLI output has invalid command or args');
  if (typeof payload.exitCode !== 'number' || typeof payload.stdout !== 'string' || typeof payload.stderr !== 'string') throw new Error('CLI output has invalid result fields');
  return payload as unknown as CliExecutionPayload;
}

function requireRecord(value: unknown): InputRecord {
  if (!isRecord(value)) throw new Error('Input must be an object');
  return value;
}

function isRecord(value: unknown): value is InputRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
