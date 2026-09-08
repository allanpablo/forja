/** CLI-first LLM Fit Loop. Credentials stay in the provider CLI; Forja stores only profiles and observations. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { DEFAULT_LLM_PROFILES, buildLlmExecution, recommendProfile, runLlm, validateProfiles, type LlmProfile, type LlmProfiles } from '../packages/llm/src/index.ts';
import { EvaluationEngine } from '../packages/evals/src/index.ts';
import { ObservabilityRecorder } from '../packages/observability/src/index.ts';
import { SqliteMigrationRunner, SqliteObservationStore, SqliteJsonRepository } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceContextDir, getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import { computeCostUsd, isPriceStale, loadPricingTable, lookupPrice, STALE_PRICE_MAX_AGE_DAYS } from '../lib/core/model-pricing.ts';
import { buildContextPrompt, buildEngineerBlock } from '../lib/llm/context.ts';
import { normalizeCodexResult, type NormalizedLlmResult } from '../lib/llm/codex-output.ts';
import { normalizeClaudeResult } from '../lib/llm/claude-output.ts';
import { LlmSessionStore, RESUME_PROVIDERS, validSessionId } from '../lib/llm/session.ts';
import { prepareValidation, validateLlmResponse } from '../lib/llm/validation.ts';

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
    const available = !probe.error && probe.status === 0;
    let compatible: boolean | null = null;
    let features: { resume: boolean; outputSchema: boolean } | undefined;
    if (available && value.provider === 'codex') {
      const help = spawnSync(value.command, ['exec', '--help'], { encoding: 'utf8', timeout: 10_000, shell: false });
      compatible = !help.error && help.status === 0 && ['--json', '--sandbox', '--config'].every((flag) => help.stdout.includes(flag));
      const resumeHelp = spawnSync(value.command, ['exec', 'resume', '--help'], { encoding: 'utf8', timeout: 10_000, shell: false });
      features = { outputSchema: !help.error && help.status === 0 && help.stdout.includes('--output-schema'),
        resume: !resumeHelp.error && resumeHelp.status === 0 && ['--json', '--config'].every((flag) => resumeHelp.stdout.includes(flag)) };
    } else if (available && value.provider === 'claude') {
      // SPEC-050 — o `claude` CLI oferece --resume nativo; schema não (validação é local, Ajv).
      const help = spawnSync(value.command, ['--help'], { encoding: 'utf8', timeout: 10_000, shell: false });
      const helpOk = !help.error && help.status === 0;
      compatible = helpOk && ['--output-format', '--print'].every((flag) => help.stdout.includes(flag));
      features = { resume: helpOk && help.stdout.includes('--resume'), outputSchema: false };
    }
    return { name: profileName, provider: value.provider, model: value.model, enabled: value.enabled, executable: value.command, available, compatible,
      features, modelAccess: 'not-probed', detail: errorCode ?? (probe.status === 0 ? String(probe.stdout).trim().split('\n')[0] : String(probe.stderr).trim().split('\n')[0]), pricing };
  });
  console.log(JSON.stringify({ profiles: result }, null, 2));
  for (const item of result) {
    if (!item.pricing.known) console.warn(`Aviso: sem preço local para ${item.provider}:${item.model} (lib/core/model-pricing.json) — custo dessas execuções não é computado. Adicione uma entrada quando souber o preço real.`);
    else if (item.pricing.stale) console.warn(`Aviso: preço de ${item.provider}:${item.model} não é revisado desde ${item.pricing.asOf} (> ${STALE_PRICE_MAX_AGE_DAYS} dias) — confira se ainda reflete o preço real do provider.`);
  }
  if (result.some((item) => item.enabled && (!item.available || item.compatible === false))) process.exitCode = 1;
}

async function run(): Promise<void> {
  const input = flags(process.argv.slice(3));
  for (const [key, values] of input) {
    if (!['--profile', '--prompt', '--task', '--context', '--resume', '--output-schema', '--validation', '--engineer'].includes(key)) throw new Error(`Opção não suportada: ${key}`);
    if (key !== '--context' && values.length !== 1) throw new Error(`Opção repetida: ${key}`);
  }
  if (input.has('--prompt') && input.has('--task')) throw new Error('Use --prompt ou --task, não ambos.');
  const name = option(input, '--profile');
  const objective = option(input, '--engineer');
  // Sem --prompt/--task, o próprio objetivo do --engineer vira o prompt.
  const prompt = option(input, '--prompt')
    ?? (option(input, '--task') ? fs.readFileSync(path.resolve(option(input, '--task')!), 'utf8') : undefined)
    ?? objective;
  if (!name || !prompt) usage();
  const selected = profile(name);

  // SPEC-048: --engineer monta o contexto pelo façade e o embute no prompt. Falha do façade =
  // falha ANTES do provedor — nunca mandar um prompt sem o contexto pedido.
  const engineerRefs: string[] = [];
  let promptWithEngineer = prompt;
  if (objective !== undefined) {
    try {
      const block = buildEngineerBlock(objective);
      promptWithEngineer = `${block.text}\n\n${prompt}`;
      engineerRefs.push(block.ref);
    } catch (error) {
      const detail = error instanceof Error && 'detail' in error ? (error as { detail: string }).detail : String(error);
      console.log(JSON.stringify({ profile: name, exitCode: 1, errorCode: 'ENGINEER_FAILED', stderr: detail }, null, 2));
      process.exit(1);
    }
  }

  const context = buildContextPrompt(promptWithEngineer, input.get('--context') ?? []);
  const prepared = prepareValidation(option(input, '--output-schema'), option(input, '--validation'));
  const resume = option(input, '--resume');
  const fullPrompt = prepared.schemaText === undefined ? context.prompt : `${context.prompt}\n\nResponda somente JSON conforme este JSON Schema:\n${prepared.schemaText}`;
  const execution = buildLlmExecution(selected, fullPrompt, { resume, outputSchema: prepared.schemaPath });
  const { db, store } = storage();
  try {
    const repository = new SqliteJsonRepository(db);
    const sessions = new LlmSessionStore(repository);
    if (resume !== undefined) sessions.require(resume, selected, process.cwd());
    const raw = await runLlm(execution, process.cwd(), selected.timeoutMs);
    let result: NormalizedLlmResult = selected.provider === 'codex'
      ? normalizeCodexResult(raw)
      : selected.provider === 'claude'
        ? normalizeClaudeResult(raw)
        : raw;
    if (result.sessionId !== undefined && (!validSessionId(result.sessionId) || (resume !== undefined && result.sessionId !== resume))) {
      result = { ...result, exitCode: result.exitCode || 1, errorCode: 'SESSION_MISMATCH', sessionId: undefined };
    }
    const sessionId = result.errorCode === 'SESSION_MISMATCH' ? undefined : result.sessionId ?? resume;
    const validation = await validateLlmResponse(prepared, result.stdout, process.cwd(), result.exitCode === 0);
    const recorder = new ObservabilityRecorder(store);
    const refs = [...engineerRefs, ...context.refs, ...[prepared.schemaPath, prepared.manifestPath].filter((value): value is string => value !== undefined)];
    const model = `${selected.provider}:${selected.model}`;
    const inputTokens = result.usage?.inputTokens ?? Math.ceil(Buffer.byteLength(fullPrompt) / 4);
    const outputTokens = result.usage?.outputTokens ?? Math.ceil(Buffer.byteLength(result.stdout) / 4);
    const tokenSource = result.usage ? 'provider' : 'estimated';
    // Table-based estimate, not provider billing (cached-token discounts are not modeled here).
    const costUsd = computeCostUsd(loadPricingTable(), model, inputTokens, outputTokens);
    if (costUsd === undefined) console.warn(`Aviso: preço desconhecido para ${model} — custo desta execução não computado. Rode \`forja llm:doctor\` ou adicione uma entrada em lib/core/model-pricing.json.`);
    const observation = await recorder.record({ traceId: `llm:${name}:${randomUUID()}`, model, inputHash: createHash('sha256').update(fullPrompt).digest('hex'), contextRefs: refs, inputTokens, outputTokens, durationMs: result.durationMs, cost: costUsd, tools: [selected.command], commands: [selected.command], outcome: result.exitCode === 0 ? 'succeeded' : 'failed', validationStatus: validation.status, errorCode: result.errorCode ?? validation.errorCode });
    repository.put('llm_validation', observation.id, { ...validation, observationId: observation.id, cwd: fs.realpathSync(process.cwd()) }, observation.updatedAt);
    if (RESUME_PROVIDERS.has(selected.provider) && sessionId !== undefined) sessions.save(sessionId, selected, process.cwd(), observation.id);
    const exitCode = result.exitCode || (validation.status === 'rejected' ? 2 : 0);
    console.log(JSON.stringify({ profile: name, model: observation.model, exitCode, executionExitCode: result.exitCode, durationMs: result.durationMs,
      executionStatus: result.exitCode === 0 ? 'completed' : 'failed', validationStatus: observation.validationStatus,
      sessionId, resumedFrom: resume, errorCode: result.errorCode ?? validation.errorCode, validation,
      usage: { inputTokens, outputTokens, cachedInputTokens: result.usage?.cachedInputTokens, source: tokenSource },
      costUsd: costUsd ?? null, costSource: costUsd === undefined ? 'unknown' : 'estimated',
      observationId: observation.id, stdout: result.stdout, stderr: result.stderr }, null, 2));
    if (exitCode !== 0) process.exitCode = exitCode;
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

/**
 * SPEC-048 — `llm:sessions list|show`. Somente leitura sobre `llm_session`: torna descobrível o
 * `SESSION_ID` que `llm:run --resume` exige. Não usa `flags()` (subcomandos são posicionais).
 */
function cmdSessions(): void {
  const args = process.argv.slice(3);
  const json = args.includes('--json');
  const positionals = args.filter((a) => !a.startsWith('--'));
  const sub = positionals[0] ?? 'list';
  if (sub !== 'list' && sub !== 'show') { console.error('Uso: forja llm:sessions <list|show> [id] [--json]'); process.exit(1); }

  const { db, store } = storage();
  try {
    const repository = new SqliteJsonRepository(db);
    const sessions = new LlmSessionStore(repository);

    if (sub === 'list') {
      const all = sessions.all();
      if (json) { console.log(JSON.stringify(all, null, 2)); return; }
      if (all.length === 0) { console.log('Nenhuma sessão registrada neste workspace.'); return; }
      console.log(`\n${all.length} sessão(ões) — mais recente primeiro. Use o id em \`llm:run --resume <id>\`.\n`);
      for (const s of all) console.log(`  ${s.id.padEnd(40)} ${path.basename(s.cwd).padEnd(24)} ${s.updatedAt}  obs:${s.observationId}`);
      return;
    }

    // show <id>
    const id = positionals[1];
    if (!id) { console.error('Uso: forja llm:sessions show <id> [--json]'); process.exit(1); }
    const session = sessions.find(id);
    if (!session) { console.error(`Sessão não encontrada: ${id}`); process.exit(1); }

    const observation = store.list().find((o: { id: string }) => o.id === session.observationId) as
      | { model?: string; outcome?: string; validationStatus?: string; durationMs?: number }
      | undefined;
    const validation = repository.get<{ status?: string; checks?: { name: string }[] }>('llm_validation', session.observationId);
    const payload = {
      session,
      observation: observation
        ? { model: observation.model ?? null, outcome: observation.outcome ?? null, validationStatus: observation.validationStatus ?? null, durationMs: observation.durationMs ?? null }
        : null,
      validation: validation ? { status: validation.status ?? null, checks: (validation.checks ?? []).map((c) => c.name) } : null,
    };
    if (json) { console.log(JSON.stringify(payload, null, 2)); return; }
    console.log(`\nSessão ${session.id}`);
    console.log(`  projeto: ${session.cwd}`);
    console.log(`  atualizada: ${session.updatedAt}`);
    console.log(`  observação: ${session.observationId}`);
    if (payload.observation) console.log(`  → ${payload.observation.model} · ${payload.observation.outcome} · validação ${payload.observation.validationStatus} · ${payload.observation.durationMs}ms`);
    if (payload.validation) console.log(`  → validação: ${payload.validation.status}${payload.validation.checks.length ? ` (checks: ${payload.validation.checks.join(', ')})` : ''}`);
    if (!payload.observation && !payload.validation) console.log('  (sem observação/validação vinculada — sessão pode ser de outra versão)');
  } finally {
    db.close();
  }
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
  else if (command === 'sessions') cmdSessions();
  else usage();
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
