import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { commandForProvider } from '../dashboard/server/lib/cli-lines.mjs';
import { buildExecSpec } from '../dashboard/server/lib/llm-executor.mjs';
import { PROVIDERS, readRouting, routingPath, writeAssignment } from '../dashboard/server/lib/llm-routing.mjs';
import workflowRoutes from '../dashboard/server/routes/workflow.mjs';

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

test('dashboard reads and writes the canonical workspace LLM profile file', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-dashboard-llm-'));
  const previous = process.env.FORJA_WORKSPACE;
  process.env.FORJA_WORKSPACE = workspace;
  try {
    const assignment = writeAssignment('/unused-repo-root', 'worker', {
      provider: 'ollama', model: 'qwen2.5-coder', command: 'ollama', taskTypes: ['implementation'],
    });
    assert.equal(routingPath('/unused-repo-root'), path.join(workspace, '.context', 'llm-profiles.json'));
    assert.equal(assignment.profile, 'worker');
    assert.deepEqual(readRouting('/unused-repo-root').assignments.worker.taskTypes, ['implementation']);
    const profile = JSON.parse(fs.readFileSync(routingPath('/unused-repo-root'), 'utf8')).profiles.worker;
    assert.equal(profile.privacy, 'local');
    assert.deepEqual(profile.roles, ['worker']);
  } finally {
    if (previous === undefined) delete process.env.FORJA_WORKSPACE;
    else process.env.FORJA_WORKSPACE = previous;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('dashboard refuses direct LLM execution and directs the operator to the audited CLI', async () => {
  const handlers = new Map();
  const app = {
    get() {},
    post(route, handler) { handlers.set(route, handler); },
  };
  await workflowRoutes(app, { repoRoot: process.cwd() });
  let statusCode;
  let body;
  await handlers.get('/api/workflow/:project/run/:role')({}, { code: (status) => {
    statusCode = status;
    return { send: (value) => { body = value; } };
  } });
  assert.equal(statusCode, 410);
  assert.deepEqual(body, {
    error: 'Execução LLM pelo dashboard foi removida para preservar auditoria, política e privacidade.',
    code: 'USE_FORJA_LLM_RUN',
    command: 'forja llm:run --profile <perfil> --task <arquivo>',
  });
});
