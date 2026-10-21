import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLlmExecution, DEFAULT_LLM_PROFILES } from '../packages/llm/src/index.ts';
import { normalizeGeminiResult, normalizeCursorResult } from '../lib/llm/json-output.ts';

// ADR-0090: adapters de agente rodam em modo somente leitura e têm a saída normalizada.
const profile = (provider, command, model = 'default') => ({ provider, model, command, roles: [], taskTypes: [], privacy: 'external', enabled: true });
const raw = (stdout, exitCode = 0) => ({ exitCode, stdout, stderr: '', durationMs: 5 });

test('gemini-cli: modo plan (somente leitura) e saída JSON', () => {
  const e = buildLlmExecution(profile('gemini-cli', 'gemini', 'gemini-2.5-pro'), 'oi');
  assert.deepEqual(e.args, ['-m', 'gemini-2.5-pro', '--approval-mode', 'plan', '-o', 'json', '-p', 'oi']);
});

test('copilot: Copilot CLI em modo -p silencioso, sem --allow-*', () => {
  const e = buildLlmExecution(profile('copilot', 'copilot'), 'oi');
  assert.deepEqual(e.args, ['-s', '-p', 'oi']);
  assert.ok(!e.args.some((a) => a.startsWith('--allow')));
});

test('cursor-agent: --print em modo plan com JSON', () => {
  assert.deepEqual(buildLlmExecution(profile('cursor-agent', 'cursor-agent'), 'oi').args, ['-p', '--mode', 'plan', '--output-format', 'json', 'oi']);
});

test('opencode: run com o agente plan', () => {
  assert.deepEqual(buildLlmExecution(profile('opencode', 'opencode', 'anthropic/claude-sonnet'), 'oi').args, ['run', '--agent', 'plan', '-m', 'anthropic/claude-sonnet', 'oi']);
});

test('perfis padrão: novos adapters existem e nascem desligados', () => {
  for (const n of ['copilot', 'cursor', 'opencode']) assert.equal(DEFAULT_LLM_PROFILES.profiles[n].enabled, false, n);
});

test('normalizeGeminiResult: resposta, sessão e tokens somados por modelo', () => {
  const r = normalizeGeminiResult(raw(JSON.stringify({ session_id: 's1', response: 'ok', stats: { models: {
    'gemini-2.5-pro': { tokens: { prompt: 100, candidates: 20, thoughts: 5, cached: 10 } },
    'gemini-2.5-flash': { tokens: { prompt: 3, candidates: 2 } },
  } } })));
  assert.equal(r.stdout, 'ok'); assert.equal(r.sessionId, 's1'); assert.equal(r.exitCode, 0);
  assert.deepEqual(r.usage, { inputTokens: 103, outputTokens: 27, cachedInputTokens: 10 });
});

test('normalizeGeminiResult: sem stats → usage indefinido (nunca zero inventado); erro → PROVIDER_FAILED', () => {
  assert.equal(normalizeGeminiResult(raw(JSON.stringify({ response: 'ok' }))).usage, undefined);
  assert.equal(normalizeGeminiResult(raw(JSON.stringify({ error: { message: 'quota' } }))).errorCode, 'PROVIDER_FAILED');
  assert.equal(normalizeGeminiResult(raw('texto solto')).errorCode, 'INVALID_PROVIDER_OUTPUT');
});

test('normalizeCursorResult: envelope do Claude, usage em camelCase ou snake_case', () => {
  const env = { type: 'result', subtype: 'success', is_error: false, result: 'feito', session_id: 'c1' };
  assert.deepEqual(normalizeCursorResult(raw(JSON.stringify({ ...env, usage: { inputTokens: 7, outputTokens: 3 } }))).usage, { inputTokens: 7, outputTokens: 3 });
  assert.deepEqual(normalizeCursorResult(raw(JSON.stringify({ ...env, usage: { input_tokens: 7, output_tokens: 3 } }))).usage, { inputTokens: 7, outputTokens: 3 });
  assert.equal(normalizeCursorResult(raw(JSON.stringify({ ...env, is_error: true }))).errorCode, 'PROVIDER_FAILED');
});
