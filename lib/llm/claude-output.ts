import type { LlmExecutionResult } from '../../packages/llm/src/index.ts';
import type { LlmUsage, NormalizedLlmResult } from './codex-output.ts';

/**
 * Normaliza a saída de `claude --print --output-format json` (SPEC-050, ADR-0085): um **objeto
 * JSON único** (não JSONL como o Codex). Lê só campos conhecidos; formato inesperado vira erro
 * visível, nunca resposta silenciosa.
 */
export function normalizeClaudeResult(result: LlmExecutionResult): NormalizedLlmResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return withError(result, '', undefined, undefined, 'INVALID_PROVIDER_OUTPUT');
  }
  if (!record(parsed)) {
    return withError(result, '', undefined, undefined, 'INVALID_PROVIDER_OUTPUT');
  }

  const answer = typeof parsed.result === 'string' ? parsed.result : undefined;
  const sessionId = typeof parsed.session_id === 'string' ? parsed.session_id : undefined;

  let usage: LlmUsage | undefined;
  if (record(parsed.usage)) {
    const raw = parsed.usage;
    if (tokens(raw.input_tokens) && tokens(raw.output_tokens)) {
      usage = {
        inputTokens: raw.input_tokens,
        outputTokens: raw.output_tokens,
        ...(tokens(raw.cache_read_input_tokens) ? { cachedInputTokens: raw.cache_read_input_tokens as number } : {}),
      };
    }
  }

  const providerFailed = parsed.is_error === true
    || (typeof parsed.subtype === 'string' && parsed.subtype !== 'success');

  const errorCode = result.errorCode
    ?? (result.exitCode !== 0 ? 'COMMAND_FAILED'
      : answer === undefined ? 'INVALID_PROVIDER_OUTPUT'
      : providerFailed ? 'PROVIDER_FAILED'
      : undefined);

  return withError(result, answer ?? '', sessionId, usage, errorCode);
}

function withError(
  result: LlmExecutionResult,
  stdout: string,
  sessionId: string | undefined,
  usage: LlmUsage | undefined,
  errorCode: string | undefined,
): NormalizedLlmResult {
  return {
    ...result,
    stdout,
    sessionId,
    usage,
    exitCode: result.exitCode !== 0 ? result.exitCode : errorCode ? 1 : 0,
    ...(errorCode ? { errorCode } : {}),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function tokens(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
