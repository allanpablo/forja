import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { publish, spawnWithEvents, newSource } from '../lib/events.mjs';
import { commandForProvider } from '../lib/cli-lines.mjs';
import { readRouting } from '../lib/llm-routing.mjs';
import { syncUniversal } from '../lib/repo-sync.mjs';
import { spawnLlm } from '../lib/llm-executor.mjs';
import { sseEvent } from '../lib/sse.mjs';
import {
  getProjectsDir,
  getWorkspaceDbPath,
  getWorkspaceProjectsMemoryDir,
  getWorkspaceSpecsDir,
  getWorkspaceContextDir,
  initWorkspace,
} from '../../../lib/workspace.mjs';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const STATUS_RE = /^(todo|running|blocked|done|review)$/;
const FILE_STATUS_RE = /-\s*\*\*Status\*\*:\s*([a-z]+)/i;

const WORKFLOW_SCHEMA = [
  {
    id: 'gsd',
    title: 'GSD runbook',
    role: 'orchestrator',
    command: 'npm run dev -- gsd:plan <slug> "<objetivo>"',
    action: { command: 'gsd:plan', args: ['<slug>', '<objetivo>'] },
  },
  {
    id: 'briefing',
    title: 'Briefing',
    role: 'orchestrator',
    command: 'registrar nome, objetivo, contexto, usuarios, riscos e gerar o slug do projeto',
    action: { command: 'gsd:handoff', args: ['spec', '<slug>', 'briefing levantado'] },
  },
  {
    id: 'structure',
    title: 'Estrutura do projeto',
    role: 'sdd-architect',
    command: 'validar pastas, memoria, specs, agentes, scripts e dashboard',
    action: { command: 'project:check', args: [] },
  },
  {
    id: 'sprints',
    title: 'Sprints definidas',
    role: 'product',
    command: 'definir sprint atual, proxima sprint, backlog e metricas 30d',
    action: { command: 'sprint:status', args: [] },
  },
  {
    id: 'context',
    title: 'Contexto inteligente montado',
    role: 'context-engineer',
    command: 'npm run dev -- context:build task <project> "<keyword>"',
    action: { command: 'context:build', args: ['task', '<slug>', '<keyword>'] },
  },
  {
    id: 'spec',
    title: 'Spec de produto aprovada',
    role: 'product',
    command: 'npm run dev -- gsd:handoff spec <slug>',
    action: { command: 'gsd:handoff', args: ['spec', '<slug>'] },
  },
  {
    id: 'design',
    title: 'Brief visual validado',
    role: 'product',
    command: 'npm run dev -- design:check <brief.md>',
    action: { command: 'design:select', args: ['agent-console', 'tecnico'] },
  },
  {
    id: 'plan',
    title: 'Plano tecnico e ADRs definidos',
    role: 'sdd-architect',
    command: 'npm run dev -- gsd:handoff plan <slug>',
    action: { command: 'gsd:handoff', args: ['plan', '<slug>'] },
  },
  {
    id: 'implement',
    title: 'Desenvolvimento por Worker',
    role: 'worker',
    command: 'npm run dev -- gsd:handoff implement <slug>',
    action: { command: 'gsd:handoff', args: ['implement', '<slug>'] },
  },
  {
    id: 'validation',
    title: 'Validacao dos passos',
    role: 'governance',
    command: 'npm run dev -- gsd:check <slug> <brief.md> && npm test',
    action: { command: 'gsd:check', args: ['<slug>', 'projects/<slug>/memory/20-architecture/design-brief.md'] },
  },
  {
    id: 'governance',
    title: 'Gate final de Governance',
    role: 'governance',
    command: 'npm run dev -- gsd:handoff review <slug>',
    action: { command: 'gsd:handoff', args: ['review', '<slug>'] },
  },
];

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function ensureProject(repoRoot, projectSlug) {
  const projectDir = path.join(getProjectsDir(), projectSlug);
  const dirs = [
    'docs',
    'memory/40-delivery',
    'memory/50-orchestration',
    'memory/60-runs',
    'memory/70-summaries',
  ];
  fs.mkdirSync(projectDir, { recursive: true });
  for (const dir of dirs) fs.mkdirSync(path.join(projectDir, dir), { recursive: true });
  return projectDir;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function findActiveDevelopmentHandoff(repoRoot, projectSlug) {
  const dbPath = getWorkspaceDbPath();
  if (!fs.existsSync(dbPath)) return null;
  const db = new Database(dbPath, { readonly: true, timeout: 5000 });
  db.pragma('busy_timeout = 5000');
  try {
    return db.prepare(`
      SELECT id, created_at, from_agent, to_agent, intent, status, spec_slug, context, acceptance, constraints, return_to
      FROM handoffs
      WHERE spec_slug = ?
        AND intent = 'implement'
        AND to_agent = 'worker'
        AND status IN ('open', 'in_progress')
      ORDER BY id DESC
      LIMIT 1
    `).get(projectSlug) || null;
  } finally {
    db.close();
  }
}

function workflowPath(repoRoot, projectSlug) {
  return path.join(getProjectsDir(), projectSlug, 'memory/60-runs/workflow.json');
}

function buildCommands(routing, roles, prompt, projectName) {
  return roles.map(role => {
    const assignment = routing.assignments[role] || routing.assignments.orchestrator || {
      provider: 'codex',
      model: 'gpt-5.3-codex',
      command: 'codex',
      taskTypes: [],
      notes: '',
    };
    return {
      role,
      ...assignment,
      commandLine: commandForProvider(assignment.provider, {
        prompt,
        role,
        projectName,
        model: assignment.model,
        command: assignment.command,
      }),
    };
  });
}

function renderProjectBrief({ projectName, projectSlug, initialPrompt, roles, commands }) {
  const now = new Date().toISOString();
  return `# Project Brief: ${projectName}

- **Slug**: ${projectSlug}
- **Criado em**: ${now}
- **Papéis iniciais**: ${roles.join(', ')}

## Prompt Inicial

${initialPrompt}

## Linhas de Comando por LLM

${commands.map(c => `### ${c.role}

- Provider: ${c.provider}
- Modelo: ${c.model || '-'}
- Comando:

\`\`\`bash
${c.commandLine}
\`\`\`
`).join('\n')}
`;
}

function renderSprint({ projectName, sprintGoal, nextSprintDetails, commands }) {
  return `# Sprint Atual

## Projeto
${projectName}

## Objetivo
${sprintGoal || 'Definir primeira entrega validável do projeto.'}

## Kanban
${WORKFLOW_SCHEMA.map((step, index) => `- [ ] ${index + 1}. ${step.title} (${step.role})`).join('\n')}

## Papéis e LLMs
${commands.map(c => `- [ ] ${c.role}: ${c.provider}${c.model ? `/${c.model}` : ''}`).join('\n')}

## Próxima Sprint
${nextSprintDetails || '- Adicionar detalhes pela tela de Workflow.'}
`;
}

function buildWorkflow({ repoRoot, projectName, projectSlug, initialPrompt, roles, sprintGoal, nextSprintDetails }) {
  const projectDir = ensureProject(repoRoot, projectSlug);
  const routing = readRouting(repoRoot);
  const commands = buildCommands(routing, roles, initialPrompt, projectName);
  const now = new Date().toISOString();

  const briefPath = path.join(projectDir, 'docs/project-brief.md');
  const sprintPath = path.join(projectDir, 'memory/40-delivery/current-sprint.md');
  const runPath = path.join(projectDir, 'memory/60-runs/initial-prompt.md');
  fs.writeFileSync(briefPath, renderProjectBrief({ projectName, projectSlug, initialPrompt, roles, commands }), 'utf8');
  fs.writeFileSync(sprintPath, renderSprint({ projectName, sprintGoal, nextSprintDetails, commands }), 'utf8');
  fs.writeFileSync(runPath, `# Prompt Inicial\n\n${initialPrompt}\n`, 'utf8');

  const workflow = {
    projectName,
    projectSlug,
    createdAt: now,
    updatedAt: now,
    sprintGoal,
    nextSprintDetails,
    roles,
    commands,
    schema: WORKFLOW_SCHEMA,
    kanban: WORKFLOW_SCHEMA.map((step, index) => ({
      id: step.id,
      title: step.title,
      status: 'todo',
      role: step.role,
      order: index + 1,
      schemaCommand: step.command,
      action: step.action,
      details: step.id === 'briefing' ? `Slug gerado: ${projectSlug}\n\n${initialPrompt.slice(0, 240)}` : '',
      updatedAt: now,
    })),
    comments: [],
    files: {
      brief: path.relative(repoRoot, briefPath),
      sprint: path.relative(repoRoot, sprintPath),
      prompt: path.relative(repoRoot, runPath),
    },
  };
  return normalizeWorkflow(workflow);
}

function defaultBriefingForProject(repoRoot, projectSlug) {
  const candidates = [
    path.join(getProjectsDir(), projectSlug, 'docs/project-brief.md'),
    path.join(getProjectsDir(), projectSlug, 'README.md'),
    path.join(getProjectsDir(), projectSlug, 'memory/10-product/vision.md'),
    path.join(getWorkspaceProjectsMemoryDir(), `${projectSlug}.md`),
  ];
  const found = candidates.find(file => fs.existsSync(file));
  const excerpt = found ? fs.readFileSync(found, 'utf8').slice(0, 1200) : '';
  return `Objetivo do projeto:
${projectSlug}

Contexto:
${excerpt || 'Completar briefing a partir do projeto existente.'}

Usuarios/papeis envolvidos:
- Orchestrator
- Product
- SDD Architect
- Worker
- Governance

Primeira entrega esperada:
Sugestao da IA: consolidar briefing, validar estrutura e propor sprint inicial.

Criterios de aceite:
- Slug confirmado: ${projectSlug}
- Estrutura do projeto validada
- Sprint inicial sugerida, editada e aprovada
`;
}

function defaultSprintSuggestion(projectSlug) {
  return {
    sprintGoal: `Sugestao da IA: validar briefing e estrutura de ${projectSlug}, aprovar spec inicial e preparar primeiro handoff de implementacao.`,
    nextSprintDetails: `Sugestao da IA:
- Revisar briefing e confirmar slug.
- Auditar estrutura do projeto e memoria.
- Criar ou revisar spec principal.
- Aprovar criterios de aceite.
- Preparar handoff para plan/implementacao quando a spec estiver aprovada.`,
  };
}

function workflowSummary(repoRoot, projectSlug) {
  const file = workflowPath(repoRoot, projectSlug);
  const data = readJson(file, null);
  if (!data) return null;
  return applyArtifactProgress(repoRoot, projectSlug, normalizeWorkflow(data));
}

function normalizeWorkflow(workflow) {
  if (!workflow) return null;
  const now = new Date().toISOString();
  const previous = Array.isArray(workflow.kanban) ? workflow.kanban : [];
  const byId = new Map(previous.map(item => [item.id, item]));
  const migrated = {
    discovery: 'briefing',
    execute: 'implement',
    review: 'validation',
  };
  for (const [oldId, newId] of Object.entries(migrated)) {
    if (!byId.has(newId) && byId.has(oldId)) byId.set(newId, byId.get(oldId));
  }
  const kanban = WORKFLOW_SCHEMA.map((step, index) => {
    const existing = byId.get(step.id) || {};
    return {
      ...existing,
      id: step.id,
      title: step.title,
      role: step.role,
      order: index + 1,
      schemaCommand: step.command,
      action: step.action,
      status: STATUS_RE.test(existing.status || '') ? existing.status : 'todo',
      details: existing.details || '',
      updatedAt: existing.updatedAt || workflow.updatedAt || now,
    };
  });
  return {
    ...workflow,
    schema: WORKFLOW_SCHEMA,
    kanban,
  };
}

function readStageStatus(repoRoot, projectSlug, stage) {
  const file = path.join(getWorkspaceSpecsDir(), projectSlug, `${stage}.md`);
  try {
    const content = fs.readFileSync(file, 'utf8');
    const match = content.match(FILE_STATUS_RE);
    return match ? match[1].toLowerCase() : 'unknown';
  } catch {
    return null;
  }
}

function stageDone(status) {
  return ['approved', 'implementing', 'done'].includes(status);
}

function applyArtifactProgress(repoRoot, projectSlug, workflow) {
  if (!workflow) return workflow;
  const byId = new Map((workflow.kanban || []).map(step => [step.id, step]));
  const now = new Date().toISOString();
  const set = (id, status, details) => {
    const step = byId.get(id);
    if (!step) return;
    const current = step.status;
    if (current === status) return;
    if (current === 'done' && status !== 'done') return;
    step.status = status;
    step.updatedAt = now;
    if (details && (!step.details || /spawn .* ENOENT/.test(step.llmReturn || ''))) {
      step.details = details;
      delete step.llmReturn;
    }
  };

  const projectBrief = path.join(getProjectsDir(), projectSlug, 'docs/project-brief.md');
  const sprint = path.join(getProjectsDir(), projectSlug, 'memory/40-delivery/current-sprint.md');
  const stack = path.join(getProjectsDir(), projectSlug, 'memory/20-architecture/stack.md');
  const design = path.join(getProjectsDir(), projectSlug, 'memory/20-architecture/design-brief.md');
  const specStatus = readStageStatus(repoRoot, projectSlug, 'spec');
  const planStatus = readStageStatus(repoRoot, projectSlug, 'plan');
  const tasksStatus = readStageStatus(repoRoot, projectSlug, 'tasks');

  if (fs.existsSync(projectBrief)) set('briefing', 'done', 'Project brief criado.');
  if (fs.existsSync(path.join(getWorkspaceContextDir(), `gsd-${projectSlug}.md`))) set('gsd', 'done', 'GSD runbook criado.');
  if (fs.existsSync(path.join(getProjectsDir(), projectSlug)) && specStatus) set('structure', 'done', 'Estrutura projects/ e specs/ encontrada.');
  if (fs.existsSync(sprint)) set('sprints', 'done', 'Sprint inicial criada.');
  if (specStatus === 'done' || stageDone(specStatus)) set('spec', 'done', `spec.md status=${specStatus}.`);
  if (fs.existsSync(design)) set('design', 'done', 'Design brief encontrado.');
  if (planStatus === 'done' || stageDone(planStatus)) set('plan', 'done', `plan.md status=${planStatus}.`);
  if (tasksStatus === 'done') set('implement', 'done', 'tasks.md concluido.');
  else if (tasksStatus || fs.existsSync(stack)) set('implement', 'running', `tasks.md status=${tasksStatus || 'sem status'}; stack=${fs.existsSync(stack) ? 'ok' : 'pendente'}.`);

  return workflow;
}

export default async function workflowRoutes(app, { repoRoot }) {
  app.post('/api/workflow/start-project', async (req, reply) => {
    const projectName = String(req.body?.projectName || '').trim();
    const initialPrompt = String(req.body?.initialPrompt || '').trim();
    const sprintGoal = String(req.body?.sprintGoal || '').trim();
    const nextSprintDetails = String(req.body?.nextSprintDetails || '').trim();
    const roles = Array.isArray(req.body?.roles) ? req.body.roles.map(r => String(r).trim().toLowerCase()).filter(Boolean) : ['orchestrator', 'context-engineer', 'product', 'sdd-architect', 'worker', 'governance'];
    const projectSlug = slugify(req.body?.projectSlug || projectName);

    if (!projectName || projectName.length < 2) return reply.code(400).send({ error: 'projectName obrigatório', code: 'PROJECT_NAME_REQUIRED' });
    if (!SLUG_RE.test(projectSlug)) return reply.code(400).send({ error: 'projectSlug inválido', code: 'INVALID_PROJECT_SLUG' });
    if (initialPrompt.length < 20) return reply.code(400).send({ error: 'initialPrompt deve ter ao menos 20 chars', code: 'PROMPT_TOO_SHORT' });

    const workflow = buildWorkflow({ repoRoot, projectName, projectSlug, initialPrompt, roles, sprintGoal, nextSprintDetails });
    writeJson(workflowPath(repoRoot, projectSlug), workflow);
    publish('workflow.updated', { projectSlug, status: 'created' });
    const sync = await syncUniversal(repoRoot, `workflow:${projectSlug}`, { projectSlug });
    return { ...workflow, sync: { code: sync.code, source: sync.source } };
  });

  app.post('/api/workflow/:project/init', async (req, reply) => {
    const projectSlug = slugify(req.params.project);
    if (!SLUG_RE.test(projectSlug)) return reply.code(400).send({ error: 'invalid project', code: 'INVALID_PROJECT' });
    const projectDir = path.join(getProjectsDir(), projectSlug);
    if (!fs.existsSync(projectDir)) return reply.code(404).send({ error: 'project not found', code: 'PROJECT_NOT_FOUND' });

    const existing = workflowSummary(repoRoot, projectSlug);
    if (existing) return existing;

    const roles = ['orchestrator', 'context-engineer', 'product', 'sdd-architect', 'worker', 'governance'];
    const { sprintGoal, nextSprintDetails } = defaultSprintSuggestion(projectSlug);
    const workflow = buildWorkflow({
      repoRoot,
      projectName: projectSlug,
      projectSlug,
      initialPrompt: defaultBriefingForProject(repoRoot, projectSlug),
      roles,
      sprintGoal,
      nextSprintDetails,
    });
    writeJson(workflowPath(repoRoot, projectSlug), workflow);
    publish('workflow.updated', { projectSlug, status: 'initialized' });
    const sync = await syncUniversal(repoRoot, `workflow-init:${projectSlug}`, { projectSlug });
    return { ...workflow, sync: { code: sync.code, source: sync.source } };
  });

  app.get('/api/workflow/:project', async (req, reply) => {
    const projectSlug = slugify(req.params.project);
    if (!SLUG_RE.test(projectSlug)) return reply.code(400).send({ error: 'invalid project', code: 'INVALID_PROJECT' });
    const workflow = workflowSummary(repoRoot, projectSlug);
    if (!workflow) return reply.code(404).send({ error: 'workflow not found', code: 'WORKFLOW_NOT_FOUND' });
    return workflow;
  });

  app.post('/api/workflow/:project/kanban/:step', async (req, reply) => {
    const projectSlug = slugify(req.params.project);
    const step = String(req.params.step || '').trim();
    const status = String(req.body?.status || '').trim();
    const details = String(req.body?.details || '').trim();
    const llmReturn = String(req.body?.llmReturn || '').trim();
    if (!STATUS_RE.test(status)) return reply.code(400).send({ error: 'invalid status', code: 'INVALID_STATUS' });

    const file = workflowPath(repoRoot, projectSlug);
    const workflow = normalizeWorkflow(readJson(file, null));
    if (!workflow) return reply.code(404).send({ error: 'workflow not found', code: 'WORKFLOW_NOT_FOUND' });
    const item = workflow.kanban.find(k => k.id === step);
    if (!item) return reply.code(404).send({ error: 'step not found', code: 'STEP_NOT_FOUND' });

    const now = new Date().toISOString();
    item.status = status;
    item.details = details || item.details;
    item.llmReturn = llmReturn || item.llmReturn || '';
    item.updatedAt = now;
    workflow.updatedAt = now;
    writeJson(file, workflow);

    const runDir = path.join(getProjectsDir(), projectSlug, 'memory/60-runs');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, `${now.replace(/[:]/g, '-')}-${step}.md`), `# LLM Return: ${step}

- **Status**: ${status}
- **Role**: ${item.role}
- **Data**: ${now}

## Detalhes
${details || '-'}

## Retorno da LLM
${llmReturn || '-'}
`, 'utf8');

    publish('workflow.updated', { projectSlug, step, status });
    const sync = await syncUniversal(repoRoot, `kanban:${projectSlug}:${step}`, { projectSlug });
    return { item, sync: { code: sync.code, source: sync.source } };
  });

  app.post('/api/workflow/:project/comments', async (req, reply) => {
    const projectSlug = slugify(req.params.project);
    const comment = String(req.body?.comment || '').trim();
    const nextSprintDetails = String(req.body?.nextSprintDetails || '').trim();
    if (!comment && !nextSprintDetails) return reply.code(400).send({ error: 'comment ou nextSprintDetails obrigatório', code: 'EMPTY_COMMENT' });

    const file = workflowPath(repoRoot, projectSlug);
    const workflow = normalizeWorkflow(readJson(file, null));
    if (!workflow) return reply.code(404).send({ error: 'workflow not found', code: 'WORKFLOW_NOT_FOUND' });
    const now = new Date().toISOString();
    if (comment) workflow.comments.push({ at: now, comment });
    if (nextSprintDetails) workflow.nextSprintDetails = nextSprintDetails;
    workflow.updatedAt = now;
    writeJson(file, normalizeWorkflow(workflow));

    const notesFile = path.join(getProjectsDir(), projectSlug, 'memory/40-delivery/next-sprint-notes.md');
    fs.writeFileSync(notesFile, `# Próxima Sprint

Atualizado em: ${now}

${workflow.nextSprintDetails || '-'}

## Comentários
${workflow.comments.map(c => `- ${c.at}: ${c.comment}`).join('\n') || '-'}
`, 'utf8');
    publish('workflow.updated', { projectSlug, status: 'commented' });
    const sync = await syncUniversal(repoRoot, `comments:${projectSlug}`, { projectSlug });
    return { comments: workflow.comments, nextSprintDetails: workflow.nextSprintDetails, sync: { code: sync.code, source: sync.source } };
  });

  app.post('/api/workflow/:project/play-development', async (req, reply) => {
    const projectSlug = slugify(req.params.project);
    if (!SLUG_RE.test(projectSlug)) return reply.code(400).send({ error: 'invalid project', code: 'INVALID_PROJECT' });

    const file = workflowPath(repoRoot, projectSlug);
    const workflow = normalizeWorkflow(readJson(file, null));
    if (!workflow) return reply.code(404).send({ error: 'workflow not found', code: 'WORKFLOW_NOT_FOUND' });

    const now = new Date().toISOString();
    for (const step of workflow.kanban) {
      if (['gsd', 'briefing', 'structure', 'sprints', 'context', 'spec', 'design', 'plan'].includes(step.id)) {
        step.status = 'done';
        step.updatedAt = now;
        if (step.llmReturn === 'spawn codex ENOENT') delete step.llmReturn;
      }
      if (step.id === 'implement') {
        step.status = 'running';
        step.details = `Development play iniciado. Worker deve executar specs/${projectSlug}/tasks.md a partir de T1.`;
        delete step.llmReturn;
        step.updatedAt = now;
      }
      if (['validation', 'governance'].includes(step.id) && ['blocked', 'running', 'review'].includes(step.status)) {
        step.status = 'todo';
        step.details = '';
        delete step.llmReturn;
        step.updatedAt = now;
      }
    }
    workflow.updatedAt = now;
    writeJson(file, workflow);

    const source = newSource();
    const existingHandoff = findActiveDevelopmentHandoff(repoRoot, projectSlug);
    let handoff;
    if (existingHandoff) {
      handoff = { code: 0, stdout: JSON.stringify(existingHandoff), stderr: '', existing: true };
    } else {
      const payload = {
        from: 'sdd-architect',
        to: 'worker',
        intent: 'implement',
        context: `Development play iniciado para ${projectSlug}. Executar specs/${projectSlug}/tasks.md dentro de projects/${projectSlug}.`,
        acceptance: 'T1-T9 executadas ou pendencias justificadas; app sobe localmente via Docker; testes/build aplicaveis executados.',
        constraints: 'Nao ampliar para GED completo; manter integracao MSSQL/ERP como provider futuro; preservar memoria existente.',
        return: 'governance',
        spec_slug: projectSlug,
      };
      handoff = await spawnWithEvents('node', ['scripts/agent-router.mjs', 'append', JSON.stringify(payload)], {
        cwd: repoRoot,
        name: `agent-router append development play ${projectSlug}`,
        source,
      });
      publish('handoff.created', { slug: projectSlug, source });
    }

    publish('workflow.updated', { projectSlug, step: 'implement', status: 'running', source });
    const sync = await syncUniversal(repoRoot, `play-development:${projectSlug}`, { projectSlug });
    return {
      workflow,
      handoff: {
        code: handoff.code,
        stdout: handoff.stdout,
        stderr: handoff.stderr,
        existing: Boolean(handoff.existing),
        source,
      },
      sync: { code: sync.code, source: sync.source },
    };
  });

  app.post('/api/workflow/:project/run/:role', async (req, reply) => {
    const projectSlug = slugify(req.params.project);
    const role = String(req.params.role || '').trim().toLowerCase();
    const step = String(req.body?.step || 'execute').trim();
    const extraPrompt = String(req.body?.prompt || '').trim();
    const file = workflowPath(repoRoot, projectSlug);
    const workflow = normalizeWorkflow(readJson(file, null));
    if (!workflow) return reply.code(404).send({ error: 'workflow not found', code: 'WORKFLOW_NOT_FOUND' });
    const command = workflow.commands.find(c => c.role === role);
    if (!command) return reply.code(404).send({ error: 'role command not found', code: 'ROLE_NOT_FOUND' });

    const kanban = workflow.kanban.find(k => k.id === step) || workflow.kanban.find(k => k.role === role) || workflow.kanban.find(k => k.id === 'implement');
    const prompt = [
      `Projeto: ${workflow.projectName}`,
      `Papel: ${role}`,
      `Step: ${kanban?.title || step}`,
      '',
      extraPrompt || workflow.commands.find(c => c.role === role)?.commandLine || '',
    ].join('\n');

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const now = new Date().toISOString();
    if (kanban) {
      kanban.status = 'running';
      kanban.updatedAt = now;
      workflow.updatedAt = now;
      writeJson(file, workflow);
      publish('workflow.updated', { projectSlug, step: kanban.id, status: 'running' });
    }

    let stream;
    try {
      stream = spawnLlm(command, prompt, { cwd: path.join(getProjectsDir(), projectSlug) });
    } catch (err) {
      reply.raw.write(sseEvent('stderr', err.message));
      reply.raw.write(sseEvent('exit', { code: -1, error: err.code || 'EXECUTOR_FAILED' }));
      reply.raw.end();
      return reply;
    }

    const chunks = [];
    const errors = [];
    reply.raw.write(sseEvent('start', { role, provider: command.provider, model: command.model, cmd: stream.cmd, args: stream.args }));

    function pipe(eventName, chunk) {
      const target = eventName === 'stderr' ? errors : chunks;
      for (const line of String(chunk).split(/\r?\n/)) {
        if (!line) continue;
        target.push(line);
        reply.raw.write(sseEvent(eventName, line));
      }
    }
    stream.stdout.on('data', chunk => pipe('stdout', chunk));
    stream.stderr.on('data', chunk => pipe('stderr', chunk));

    const result = await stream.done;
    const end = new Date().toISOString();
    const status = result.code === 0 ? 'review' : 'blocked';
    if (kanban) {
      kanban.status = status;
      kanban.llmReturn = chunks.join('\n') || errors.join('\n') || result.error || '';
      kanban.details = `Execução ${command.provider}/${command.model || '-'} finalizada com code=${result.code}.`;
      kanban.updatedAt = end;
      workflow.updatedAt = end;
      writeJson(file, workflow);
    }

    const runDir = path.join(getProjectsDir(), projectSlug, 'memory/60-runs');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, `${end.replace(/[:]/g, '-')}-${role}-terminal.md`), `# LLM Terminal: ${role}

- **Provider**: ${command.provider}
- **Model**: ${command.model || '-'}
- **Step**: ${kanban?.id || step}
- **Status**: ${status}
- **Exit code**: ${result.code}
- **Started at**: ${now}
- **Finished at**: ${end}

## Prompt
${prompt}

## STDOUT
${chunks.join('\n') || '-'}

## STDERR
${errors.join('\n') || result.error || '-'}
`, 'utf8');

    publish('workflow.updated', { projectSlug, step: kanban?.id || step, status });
    const sync = await syncUniversal(repoRoot, `llm-run:${projectSlug}:${role}`, { projectSlug });
    reply.raw.write(sseEvent('exit', { ...result, status, sync: { code: sync.code, source: sync.source } }));
    reply.raw.end();
    return reply;
  });
}
