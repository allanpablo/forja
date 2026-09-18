import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { recommendNext, collectStatus } from '../lib/status-model.ts';
import { normalizeStatus, listSpecs } from '../lib/specs-index.ts';
import { listProjects } from '../lib/workspace.ts';
import { resolveRepoRoot } from '../scripts/forja-status.ts';

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

// --- normalizeStatus e specs index --------------------------------------------

test('normalizeStatus: reconhece variações de status, português e backticks', () => {
  assert.equal(normalizeStatus('`approved`'), 'approved');
  assert.equal(normalizeStatus('em implementação — incremento A'), 'implementing');
  assert.equal(normalizeStatus('concluído'), 'done');
  assert.equal(normalizeStatus('concluido'), 'done');
  assert.equal(normalizeStatus('draft | review | approved'), 'draft');
  assert.equal(normalizeStatus('aprovado'), 'approved');
  assert.equal(normalizeStatus('revisão'), 'review');
});

test('listSpecs: reconhece spec com status formatado flexível', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-specs-test-'));
  try {
    const s1 = path.join(tmp, 'specs', 'feat-a');
    fs.mkdirSync(s1, { recursive: true });
    fs.writeFileSync(path.join(s1, 'spec.md'), '# Feat A\n\nStatus: em implementação\n');
    fs.writeFileSync(path.join(s1, 'plan.md'), '# Plan A\n\n- **Status**: `approved`\n');

    const s2 = path.join(tmp, 'specs', 'feat-b');
    fs.mkdirSync(s2, { recursive: true });
    fs.writeFileSync(path.join(s2, 'spec.md'), '# Feat B\n\n- **Status**: concluído\n');

    const specs = listSpecs(tmp);
    assert.equal(specs.length, 2);
    const fa = specs.find((s) => s.slug === 'feat-a');
    assert.equal(fa?.status, 'implementing');
    assert.equal(fa?.plan, 'approved');
    const fb = specs.find((s) => s.slug === 'feat-b');
    assert.equal(fb?.status, 'done');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- listProjects com symlinks -----------------------------------------------

test('listProjects: reconhece projetos apontados por vínculo simbólico', () => {
  const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-symlink-ws-'));
  const tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-symlink-target-'));
  process.env.FORJA_WORKSPACE = tmpWs;
  try {
    const projectsDir = path.join(tmpWs, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });
    // Diretório físico
    fs.mkdirSync(path.join(projectsDir, 'proj-real'));
    // Vínculo simbólico para diretório
    fs.symlinkSync(tmpTarget, path.join(projectsDir, 'proj-symlink'));

    const projects = listProjects();
    assert.ok(projects.includes('proj-real'), 'deve incluir diretório físico');
    assert.ok(projects.includes('proj-symlink'), 'deve incluir projeto vinculado por symlink');
  } finally {
    delete process.env.FORJA_WORKSPACE;
    fs.rmSync(tmpWs, { recursive: true, force: true });
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  }
});

test('resolveRepoRoot: prioriza projeto targetArg e diretório do projeto', () => {
  const res = resolveRepoRoot('root');
  assert.equal(res, root);
});

