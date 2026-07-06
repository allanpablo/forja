import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildServer } from '../index.mjs';

const EXPECTED_STEPS = [
  'gsd',
  'briefing',
  'structure',
  'sprints',
  'context',
  'spec',
  'design',
  'plan',
  'implement',
  'validation',
  'governance',
];

test('workflow start-project cria steps na ordem do schema operacional', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-workflow-'));
  process.env.FORJA_WORKSPACE = root;
  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({
    method: 'POST',
    url: '/api/workflow/start-project',
    payload: {
      projectName: 'Projeto Steps',
      projectSlug: 'projeto-steps',
      initialPrompt: 'Objetivo do projeto com contexto suficiente para iniciar levantamento operacional.',
      roles: ['orchestrator', 'context-engineer', 'product', 'sdd-architect', 'worker', 'governance'],
      sprintGoal: 'primeira entrega validavel',
    },
  });
  await app.close();

  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.deepEqual(body.kanban.map(step => step.id), EXPECTED_STEPS);
  assert.deepEqual(body.kanban.map(step => step.order), EXPECTED_STEPS.map((_, index) => index + 1));
  assert.equal(body.kanban[0].title, 'GSD runbook');
  assert.equal(body.kanban[0].action.command, 'gsd:plan');
  assert.match(body.kanban[1].details, /Slug gerado: projeto-steps/);
  assert.equal(body.kanban.at(-1).title, 'Gate final de Governance');
});

test('workflow get normaliza workflow antigo para o schema atual', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-workflow-old-'));
  process.env.FORJA_WORKSPACE = root;
  const workflowFile = path.join(root, 'projects', 'legacy', 'memory/60-runs/workflow.json');
  fs.mkdirSync(path.dirname(workflowFile), { recursive: true });
  fs.writeFileSync(workflowFile, JSON.stringify({
    projectName: 'Legacy',
    projectSlug: 'legacy',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    kanban: [
      { id: 'briefing', title: 'Briefing validado', status: 'done', role: 'ceo' },
      { id: 'execute', title: 'Execucao', status: 'running', role: 'orchestrator' },
      { id: 'review', title: 'Review', status: 'todo', role: 'governance' },
    ],
  }), 'utf8');

  const app = buildServer({ logger: false, repoRoot: root });
  const res = await app.inject({ method: 'GET', url: '/api/workflow/legacy' });
  await app.close();

  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.deepEqual(body.kanban.map(step => step.id), EXPECTED_STEPS);
  assert.equal(body.kanban.find(step => step.id === 'briefing').status, 'done');
  assert.equal(body.kanban.find(step => step.id === 'implement').status, 'running');
  assert.equal(body.kanban.find(step => step.id === 'validation').status, 'todo');
});
