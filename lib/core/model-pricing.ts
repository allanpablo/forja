/**
 * lib/core/model-pricing.ts — tabela de preço local, versionada (SPEC-029, AC-3).
 *
 * Local-first por design (NFR do spec): nenhuma chamada de rede. `lib/core/model-pricing.json` é
 * mantido manualmente/por PR, não sincronizado com o billing real de nenhum provider — ver "Fora"
 * do SPEC-029. Cada entrada carrega `asOf` porque preço de LLM muda com frequência (risco do spec);
 * `pricingWarnings` abaixo é o que alimenta o aviso de "tabela desatualizada" em `forja llm:doctor`.
 *
 * Preço desconhecido nunca lança: `lookupPrice`/`computeCostUsd` devolvem `undefined` (AC-4). Quem
 * chama decide o que fazer com isso — normalmente: seguir a execução e avisar, nunca bloquear.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_PRICING_PATH = path.join(__dirname, 'model-pricing.json');

/** Dias após os quais um preço não revisado é considerado velho (risco do SPEC-029: "asOf > 90 dias"). */
export const STALE_PRICE_MAX_AGE_DAYS = 90;

export interface ModelPrice {
  readonly inputPer1kUsd: number;
  readonly outputPer1kUsd: number;
  /** Data (YYYY-MM-DD) em que este preço foi conferido pela última vez. */
  readonly asOf: string;
}

export interface PricingTable {
  readonly version: number;
  readonly currency: 'USD';
  /** Chave: `${provider}:${model}` — o mesmo formato já usado em `Observation.model` (ver LlmProfile). */
  readonly prices: Readonly<Record<string, ModelPrice>>;
}

export class ModelPricingError extends Error {
  constructor(message: string) { super(message); this.name = 'ModelPricingError'; }
}

/** Lê e valida a tabela local. Sem rede — só filesystem (NFR local-first do SPEC-029). */
export function loadPricingTable(filePath: string = DEFAULT_PRICING_PATH): PricingTable {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error: unknown) {
    throw new ModelPricingError(`Falha ao ler tabela de preço (${filePath}): ${error instanceof Error ? error.message : 'erro desconhecido'}`);
  }
  return validatePricingTable(raw, filePath);
}

export function validatePricingTable(value: unknown, source = '<inline>'): PricingTable {
  if (!isRecord(value) || typeof value.version !== 'number' || value.currency !== 'USD' || !isRecord(value.prices)) {
    throw new ModelPricingError(`Tabela de preço inválida (${source}): esperado { version, currency: 'USD', prices }`);
  }
  const prices: Record<string, ModelPrice> = {};
  for (const [model, entry] of Object.entries(value.prices)) prices[model] = validatePrice(model, entry, source);
  return { version: value.version, currency: 'USD', prices };
}

function validatePrice(model: string, value: unknown, source: string): ModelPrice {
  if (!isRecord(value) || typeof value.inputPer1kUsd !== 'number' || value.inputPer1kUsd < 0 || typeof value.outputPer1kUsd !== 'number' || value.outputPer1kUsd < 0 || typeof value.asOf !== 'string' || value.asOf.trim().length === 0) {
    throw new ModelPricingError(`Preço inválido para "${model}" (${source}): esperado { inputPer1kUsd >= 0, outputPer1kUsd >= 0, asOf }`);
  }
  return { inputPer1kUsd: value.inputPer1kUsd, outputPer1kUsd: value.outputPer1kUsd, asOf: value.asOf };
}

/** `undefined` quando o provider/modelo não está na tabela — nunca lança (AC-4: preço desconhecido não bloqueia). */
export function lookupPrice(table: PricingTable, model: string | undefined): ModelPrice | undefined {
  if (model === undefined) return undefined;
  return table.prices[model];
}

/**
 * Custo real estimado em USD para `model`, a partir de tokens de entrada/saída já capturados
 * (ex.: `Observation.inputTokens`/`outputTokens`). `undefined` quando o preço é desconhecido —
 * o chamador decide entre seguir sem custo computado (fail-open, AC-4) ou logar um aviso.
 */
export function computeCostUsd(table: PricingTable, model: string | undefined, inputTokens: number, outputTokens: number): number | undefined {
  const price = lookupPrice(table, model);
  if (price === undefined) return undefined;
  return (inputTokens / 1000) * price.inputPer1kUsd + (outputTokens / 1000) * price.outputPer1kUsd;
}

/** True quando `price.asOf` está mais velho que `maxAgeDays` em relação a `now` (mitigação de risco do SPEC-029). */
export function isPriceStale(price: ModelPrice, now: Date = new Date(), maxAgeDays = STALE_PRICE_MAX_AGE_DAYS): boolean {
  const asOf = new Date(price.asOf);
  if (Number.isNaN(asOf.getTime())) return true;
  const ageDays = (now.getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays > maxAgeDays;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
