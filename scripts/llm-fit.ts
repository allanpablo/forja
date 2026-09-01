/** CLI-first LLM Fit Loop. Credentials stay in the provider CLI; Forja stores only profiles and observations. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { DEFAULT_LLM_PROFILES, buildLlmExecution, recommendProfile, runLlm, validateProfiles, type LlmProfile, type LlmProfiles } from '../packages/llm/src/index.ts';
import { EvaluationEngine } from '../packages/evals/src/index.ts';
import { ObservabilityRecorder } from '../packages/observability/src/index.ts';
import { SqliteMigrationRunner, SqliteObservationStore } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceContextDir, getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import { computeCostUsd, isPriceStale, loadPricingTable, lookupPrice, STALE_PRICE_MAX_AGE_DAYS } from '../lib/core/model-pricing.ts';

const profilePath = () => path.join(getWorkspaceContextDir(), 'llm-profiles.json');

function usage(): never {
  console.error('Uso: forja llm:<doctor|profiles:init|probe|recommend|run|eval>');
  process.exit(1);
}

function profiles(): LlmProfiles {
  if (!fs.existsSync(profilePath())) throw new Error(`Perfis ausentes: execute forja llm:profiles:init (${profilePath()})`);
  return validateProfiles(JSON.parse(fs.readFileSync(profilePath(), 'utf8')));
}

function profile(name: string): LlmProfile {
  const value = profiles().profiles[name];
  if (!value) throw new Error(`Perfil não encontrado: ${name}`);
  return value;
}

function flags(args: readonly string[]): Map<string, string[]> {
  const output = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!flag.startsWith('--')) throw new Error(`Argumento inválido: ${flag}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Valor ausente para ${flag}`);
    output.set(flag, [...(output.get(flag) ?? []), value]);
    index += 1;
  }
  return output;
}

function option(input: Map<string, string[]>, name: string): string | undefined { return input.get(name)?.at(-1); }

function storage() {
  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const db = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(db).apply();
  return { db, store: new SqliteObservationStore(db) };
}

/**
 * Aviso de preço (SPEC-029, AC-4 e risco "tabela desatualizada"): não bloqueia nada — `doctor()`
 * segue reportando disponibilidade dos adapters como sempre. `pricing.missing`/`pricing.stale` são
 * só o ponto onde um humano descobre "atualize lib/core/model-pricing.json" antes que o gap vire
 * surpresa na fatura, sem que a checagem de disponibilidade dependa de ter preço conhecido.
 */
function pricingInfo(model: string): { readonly known: boolean; readonly asOf?: string; readonly stale?: boolean } {
  const price = lookupPrice(loadPricingTable(), model);
  if (price === undefined) return { known: false };
  return { known: true, asOf: price.asOf, stale: isPriceStale(price) };
}

function doctor(name?: string): void {
  const configured = profiles().profiles;
  if (name && !configured[name]) throw new Error(`Perfil não encontrado: ${name}`);
  const result = Object.entries(configured).filter(([profileName]) => name === undefined || profileName === name).map(([profileName, value]) => {
    const probe = spawnSync(value.command, ['--version'], { encoding: 'utf8', timeout: 10_000, shell: false });
    const errorCode = (probe.error as NodeJS.ErrnoException | undefined)?.code;
    const model = `${value.provider}:${value.model}`;
    const pricing = pricingInfo(model);
    return { name: profileName, provider: value.provider, model: value.model, enabled: value.enabled, executable: value.command, available: !probe.error && probe.status === 0, detail: errorCode ?? (probe.status === 0 ? String(probe.stdout).trim().split('\n')[0] : String(probe.stderr).trim().split('\n')[0]), pricing };
  });
  console.log(JSON.stringify({ profiles: result }, null, 2));
  for (const item of result) {
    if (!item.pricing.known) console.warn(`Aviso: sem preço local para ${item.provider}:${item.model} (lib/core/model-pricing.json) — custo dessas execuções não é computado. Adicione uma entrada quando souber o preço real.`);
    else if (item.pricing.stale) console.warn(`Aviso: preço de ${item.provider}:${item.model} não é revisado desde ${item.pricing.asOf} (> ${STALE_PRICE_MAX_AGE_DAYS} dias) — confira se ainda reflete o preço real do provider.`);
  }
  if (result.some((item) => item.enabled && !item.available)) process.exitCode = 1;
}

async function run(): Promise<void> {
  const input = flags(process.argv.slice(3));
  const name = option(input, '--profile');
  const prompt = option(input, '--prompt') ?? (option(input, '--task') ? fs.readFileSync(path.resolve(option(input, '--task')!), 'utf8') : undefined);
  if (!name || !prompt) usage();
  const selected = profile(name);
  const result = await runLlm(buildLlmExecution(selected, prompt), process.cwd());
  const { db, store } = storage();
  try {
    const recorder = new ObservabilityRecorder(store);
    const refs = (input.get('--context') ?? []).map((value) => path.resolve(value));
    const model = `${selected.provider}:${selected.model}`;
    const inputTokens = Math.ceil(Buffer.byteLength(prompt) / 4);
    const outputTokens = Math.ceil(Buffer.byteLength(result.stdout) / 4);
    // AC-6/AC-4 (SPEC-029): custo real quando a tabela local conhece o preço; fail-open (undefined,
    // não bloqueia, apenas avisa) quando não conhece — mesma tabela usada por `checkLimits`/AC-2.
    const costUsd = computeCostUsd(loadPricingTable(), model, inputTokens, outputTokens);
    if (costUsd === undefined) console.warn(`Aviso: preço desconhecido para ${model} — custo desta execução não computado. Rode \`forja llm:doctor\` ou adicione uma entrada em lib/core/model-pricing.json.`);
    const observation = await recorder.record({ traceId: `llm:${name}:${randomUUID()}`, model, inputHash: createHash('sha256').update(prompt).digest('hex'), contextRefs: refs, inputTokens, outputTokens, durationMs: result.durationMs, cost: costUsd, tools: [selected.command], commands: [selected.command], outcome: result.exitCode === 0 ? 'succeeded' : 'failed', errorCode: result.errorCode });
    console.log(JSON.stringify({ profile: name, model: observation.model, exitCode: result.exitCode, durationMs: result.durationMs, costUsd: observation.cost, observationId: observation.id, stdout: result.stdout, stderr: result.stderr }, null, 2));
    if (result.exitCode !== 0) process.exitCode = result.exitCode;
  } finally { db.close(); }
}

function recommend(): void {
  const input = flags(process.argv.slice(3));
  const role = option(input, '--role');
  const task = option(input, '--task');
  if (!role || !task) usage();
  const { db, store } = storage();
  try { console.log(JSON.stringify({ role, task, recommendations: recommendProfile(profiles(), store.list(), role, task, option(input, '--privacy') as LlmProfile['privacy'] | undefined) }, null, 2)); } finally { db.close(); }
}

async function evaluate(): Promise<void> {
  const input = flags(process.argv.slice(3));
  const scope = option(input, '--scope') ?? 'workspace';
  const scopeId = option(input, '--id');
  if (!['workspace', 'model', 'agent', 'task', 'sprint', 'run', 'capability', 'strategy'].includes(scope)) throw new Error(`Escopo inválido: ${scope}`);
  const { db, store } = storage();
  try { console.log(JSON.stringify(await new EvaluationEngine(store).evaluate({ scope: scope as 'workspace' | 'model', scopeId }), null, 2)); } finally { db.close(); }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === 'profiles:init') {
    fs.mkdirSync(path.dirname(profilePath()), { recursive: true });
    if (fs.existsSync(profilePath()) && !process.argv.includes('--force')) throw new Error(`Perfis já existem: ${profilePath()} (use --force para substituir)`);
    fs.writeFileSync(profilePath(), `${JSON.stringify(DEFAULT_LLM_PROFILES, null, 2)}\n`);
    console.log(`Perfis LLM criados: ${profilePath()}`);
  } else if (command === 'doctor' || command === 'probe') doctor(process.argv[3]);
  else if (command === 'recommend') recommend();
  else if (command === 'run') await run();
  else if (command === 'eval') await evaluate();
  else usage();
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
