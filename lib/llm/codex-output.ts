import type { LlmExecutionResult } from '../../packages/llm/src/index.ts';

export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens?: number;
}

export interface NormalizedLlmResult extends LlmExecutionResult {
  readonly sessionId?: string;
  readonly usage?: LlmUsage;
}

/** Parse only known metadata/final messages. Never return raw event logs as the model's answer. */
export function normalizeCodexResult(result: LlmExecutionResult): NormalizedLlmResult {
  let sessionId: string | undefined;
  let usage: LlmUsage | undefined;
  let answer = '';
  let completed = false;
  let invalid = false;
  let failed = false;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: unknown;
    try { event = JSON.parse(line); } catch { invalid = true; continue; }
    if (!record(event) || typeof event.type !== 'string') { invalid = true; continue; }
    if (event.type === 'thread.started' && typeof event.thread_id === 'string') sessionId = event.thread_id;
    if (event.type === 'item.completed' && record(event.item) && event.item.type === 'agent_message') {
      if (typeof event.item.text !== 'string') invalid = true;
      else answer = event.item.text;
    }
    if (event.type === 'turn.failed' || event.type === 'error') failed = true;
    if (event.type === 'turn.completed') {
      completed = true;
      if (event.usage !== undefined && event.usage !== null) {
        const value = event.usage;
        if (!record(value) || !tokens(value.input_tokens) || !tokens(value.output_tokens)
          || (value.cached_input_tokens !== undefined && (!tokens(value.cached_input_tokens) || value.cached_input_tokens > value.input_tokens))) {
          invalid = true;
        } else {
          usage = { inputTokens: value.input_tokens, outputTokens: value.output_tokens,
            ...(value.cached_input_tokens !== undefined ? { cachedInputTokens: value.cached_input_tokens as number } : {}) };
        }
      }
    }
  }
  const errorCode = result.errorCode ?? (result.exitCode !== 0 ? 'COMMAND_FAILED' : failed ? 'PROVIDER_FAILED' : invalid ? 'INVALID_PROVIDER_OUTPUT' : !completed ? 'INCOMPLETE_PROVIDER_OUTPUT' : undefined);
  return { ...result, stdout: answer, sessionId, usage,
    exitCode: result.exitCode !== 0 ? result.exitCode : errorCode ? 1 : 0,
    ...(errorCode ? { errorCode } : {}),
  };
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function tokens(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
