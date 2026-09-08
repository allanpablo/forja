import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { recommendNext, collectStatus } from '../lib/status-model.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const forja = path.join(root, 'bin/forja.ts');

function run(args, env = process.env) {
  return spawnSync(process.execPath, [forja, ...args], { cwd: root, encoding: 'utf8', env });
}

// --- CLI: forma da saída -----------------------------------------------------

test('forja status --json: 6 chaves + status:"ok", exit 0', () => {
  const ws = path.join(os.tmpdir(), `forja-ws-none-${Date.now()}`);
  const res = run(['status', '--json'], { ...process.env, FORJA_WORKSPACE: ws });
  assert.equal(res.status, 0);
  const d = JSON.parse(res.stdout);
  assert.equal(d.status, 'ok');
  for (const k of ['workspace', 'sprint', 'orchestrate', 'specs', 'recentRuns', 'handoffs']) {
    assert.ok(k in d, `chave ausente: ${k}`);
  }
  assert.equal(d.workspace.exists, false);
});

test('forja next --json: workspace ausente → action setup', () => {
  const ws = path.join(os.tmpdir(), `forja-ws-none-${Date.now()}`);
  const res = run(['next', '--json'], { ...process.env, FORJA_WORKSPACE: ws });
  assert.equal(res.status, 0);
  const d = JSON.parse(res.stdout);
  assert.equal(d.action, 'setup');
  assert.equal(d.command, 'forja setup');
});

test('forja status (texto): sem stack trace, seções rotuladas', () => {
  const res = run(['status']);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Workspace:/);
  assert.match(res.stdout, /Specs:/);
  assert.ok(!res.stdout.includes('    at ') && !res.stderr.includes('    at '), 'vazou stack trace');
});

// --- collectStatus: nunca lança -------------------------------------------

test('collectStatus: workspace ausente → model completo, nunca lança', async () => {
  process.env.FORJA_WORKSPACE = path.join(os.tmpdir(), `forja-ws-none-${Date.now()}`);
  try {
    const m = await collectStatus(root);
    assert.equal(m.workspace.exists, false);
    assert.equal(m.workspace.memoryIndexed, false);
    // handoffs degrada para lista vazia sem quebrar
    assert.equal(m.handoffs.available, true);
    assert.deepEqual(m.handoffs.value, []);
  } finally {
    delete process.env.FORJA_WORKSPACE;
  }
});

// --- recommendNext: os 7 ramos da AC-4 ----------------------------------

const base = {
  workspace: { root: '/ws', source: 'default', exists: true, memoryIndexed: true },
  sprint: { available: true, value: null },
  orchestrate: { available: true, value: { runs: [] } },
  specs: { available: true, value: [] },
  recentRuns: { available: true, value: [] },
  handoffs: { available: true, value: [] },
};
const spec = (over) => ({ slug: 's', status: 'draft', plan: null, tasks: null, ...over });

test('recommendNext 1: workspace ausente → setup', () => {
  const r = recommendNext({ ...base, workspace: { ...base.workspace, exists: false } });
  assert.equal(r.action, 'setup');
});

test('recommendNext 2: memória não indexada → sync', () => {
  const r = recommendNext({ ...base, workspace: { ...base.workspace, memoryIndexed: false } });
  assert.equal(r.action, 'sync');
  assert.equal(r.command, 'forja sync:universal');
});

test('recommendNext 3: corrida com gate vermelho → orchestrate:advance com parecer', () => {
  const runs = [{ slug: 'pix', goal: 'x', openStage: 'implement', openVerdict: 'gate reprovou (exit 1)', concluded: false }];
  const r = recommendNext({ ...base, orchestrate: { available: true, value: { runs } } });
  assert.equal(r.command, 'forja orchestrate:advance pix');
  assert.match(r.reason, /travada/);
});

test('recommendNext 4: corrida com etapa pronta → orchestrate:advance', () => {
  const runs = [{ slug: 'pix', goal: 'x', openStage: 'spec', openVerdict: null, concluded: false }];
  const r = recommendNext({ ...base, orchestrate: { available: true, value: { runs } } });
  assert.equal(r.command, 'forja orchestrate:advance pix');
  assert.doesNotMatch(r.reason, /travada/);
});

test('recommendNext 5a: spec approved sem plan → spec:plan', () => {
  const r = recommendNext({ ...base, specs: { available: true, value: [spec({ status: 'approved' })] } });
  assert.equal(r.action, 'spec:plan');
  assert.equal(r.command, 'forja spec:plan s');
});

test('recommendNext 5b: plan approved sem tasks → spec:tasks', () => {
  const r = recommendNext({ ...base, specs: { available: true, value: [spec({ status: 'approved', plan: 'approved' })] } });
  assert.equal(r.action, 'spec:tasks');
});

test('recommendNext 6: spec implementing → spec:check', () => {
  const r = recommendNext({
    ...base,
    specs: { available: true, value: [spec({ status: 'implementing', plan: 'approved', tasks: 'approved' })] },
  });
  assert.equal(r.action, 'spec:check');
  assert.equal(r.command, 'forja spec:check s');
});

test('recommendNext 7: nada pendente → orchestrate', () => {
  const r = recommendNext(base);
  assert.equal(r.action, 'orchestrate');
});

test('recommendNext: ordem — workspace ausente vence corrida vermelha', () => {
  const runs = [{ slug: 'pix', goal: 'x', openStage: 'implement', openVerdict: 'gate reprovou (exit 1)', concluded: false }];
  const r = recommendNext({
    ...base,
    workspace: { ...base.workspace, exists: false },
    orchestrate: { available: true, value: { runs } },
  });
  assert.equal(r.action, 'setup');
});
