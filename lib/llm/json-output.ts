import type { LlmExecutionResult } from '../../packages/llm/src/index.ts';
import type { LlmUsage, NormalizedLlmResult } from './codex-output.ts';
import { normalizeClaudeResult } from './claude-output.ts';

/**
 * Normaliza `gemini -o json` (ADR-0090): um objeto `{ session_id, response, stats, error }`, com o uso
 * por modelo em `stats.models[<modelo>].tokens.{prompt, candidates, cached}` — formato lido do
 * JsonFormatter do próprio Gemini CLI. Campos ausentes viram `undefined`, nunca zero inventado.
 */
export function normalizeGeminiResult(result: LlmExecutionResult): NormalizedLlmResult {
  let parsed: unknown;
  try { parsed = JSON.parse(result.stdout); } catch { return withError(result, '', undefined, undefined, 'INVALID_PROVIDER_OUTPUT'); }
  if (!record(parsed)) return withError(result, '', undefined, undefined, 'INVALID_PROVIDER_OUTPUT');

  const answer = typeof parsed.response === 'string' ? parsed.response : undefined;
  const sessionId = typeof parsed.session_id === 'string' ? parsed.session_id : undefined;

  let usage: LlmUsage | undefined;
  const models = record(parsed.stats) && record(parsed.stats.models) ? Object.values(parsed.stats.models) : [];
  let input = 0, output = 0, cached = 0, seen = false;
  for (const m of models) {
    if (!record(m) || !record(m.tokens)) continue;
    const t = m.tokens;
    if (tokens(t.prompt) && tokens(t.candidates)) {
      seen = true;
      input += t.prompt;
      output += t.candidates + (tokens(t.thoughts) ? t.thoughts : 0);
      if (tokens(t.cached)) cached += t.cached;
    }
  }
  if (seen) usage = { inputTokens: input, outputTokens: output, ...(cached ? { cachedInputTokens: cached } : {}) };

  const errorCode = result.errorCode
    ?? (result.exitCode !== 0 ? 'COMMAND_FAILED'
      : parsed.error !== undefined ? 'PROVIDER_FAILED'
      : answer === undefined ? 'INVALID_PROVIDER_OUTPUT'
      : undefined);
  return withError(result, answer ?? '', sessionId, usage, errorCode);
}

/**
 * Normaliza `cursor-agent -p --output-format json`: o mesmo envelope do Claude
 * (`type: "result"`, `subtype`, `is_error`, `result`, `session_id`, `usage`). O Cursor usa
 * `inputTokens`/`outputTokens` em camelCase em alguns caminhos; os nomes são alinhados antes.
 */
export function normalizeCursorResult(result: LlmExecutionResult): NormalizedLlmResult {
  let parsed: unknown;
  try { parsed = JSON.parse(result.stdout); } catch { return withError(result, '', undefined, undefined, 'INVALID_PROVIDER_OUTPUT'); }
  if (record(parsed) && record(parsed.usage)) {
    const u = parsed.usage;
    parsed = {
      ...parsed,
      usage: {
        input_tokens: u.input_tokens ?? u.inputTokens,
        output_tokens: u.output_tokens ?? u.outputTokens,
        cache_read_input_tokens: u.cache_read_input_tokens ?? u.cacheReadTokens,
      },
    };
  }
  return normalizeClaudeResult({ ...result, stdout: JSON.stringify(parsed) });
}

function withError(result: LlmExecutionResult, stdout: string, sessionId: string | undefined, usage: LlmUsage | undefined, errorCode: string | undefined): NormalizedLlmResult {
  return { ...result, stdout, sessionId, usage, exitCode: result.exitCode !== 0 ? result.exitCode : errorCode ? 1 : 0, ...(errorCode ? { errorCode } : {}) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function tokens(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
