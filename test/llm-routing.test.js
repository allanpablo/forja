import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandForProvider } from '../dashboard/server/lib/cli-lines.mjs';
import { buildExecSpec } from '../dashboard/server/lib/llm-executor.mjs';
import { PROVIDERS } from '../dashboard/server/lib/llm-routing.mjs';

test('catalogo inclui providers LLM conhecidos', () => {
  const ids = new Set(PROVIDERS.map(provider => provider.id));
  for (const id of ['deepseek', 'minimax', 'mistral', 'qwen', 'ollama', 'openrouter']) {
    assert.ok(ids.has(id), `provider ${id} deveria existir`);
  }
});

test('ollama usa formato run no executor e no comando exibido', () => {
  const assignment = { provider: 'ollama', model: 'deepseek-r1', command: 'ollama' };
  const spec = buildExecSpec(assignment, 'teste curto');
  assert.equal(spec.cmd, 'ollama');
  assert.deepEqual(spec.args, ['run', 'deepseek-r1', 'teste curto']);

  const line = commandForProvider('ollama', {
    role: 'worker',
    projectName: 'demo',
    model: 'deepseek-r1',
    command: 'ollama',
    prompt: 'teste curto',
  });
  assert.match(line, /^ollama run 'deepseek-r1' /);
});
