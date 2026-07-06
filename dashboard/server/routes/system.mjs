import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  getProjectsDir,
  getWorkspaceDbPath,
  getWorkspaceSpecsDir,
  getWorkspaceContextDir,
  initWorkspace,
} from '../../../lib/workspace.mjs';

const NAME_RE = /^[a-zA-Z0-9_-]+$/;
const FILE_STATUS_RE = /-\s*\*\*Status\*\*:\s*([a-z]+)/i;

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

async function listProjectNames() {
  initWorkspace();
  const dir = getProjectsDir();
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory() && NAME_RE.test(entry.name)).map(entry => entry.name).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function dbSummary() {
  initWorkspace();
  const dbPath = getWorkspaceDbPath();
  const empty = { handoffs: {}, latestHandoffs: [], memoryNodes: 0 };
  if (!fs.existsSync(dbPath)) return empty;
  const db = new Database(dbPath, { readonly: true, timeout: 5000 });
  db.pragma('busy_timeout = 5000');
  try {
    const handoffs = {};
    for (const row of db.prepare('SELECT status, COUNT(*) AS total FROM handoffs GROUP BY status').all()) {
      handoffs[row.status] = row.total;
    }
    const latestHandoffs = db.prepare(`
      SELECT id, from_agent, to_agent, intent, status, spec_slug, created_at
      FROM handoffs
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 8
    `).all();
    let memoryNodes = 0;
    try {
      memoryNodes = db.prepare('SELECT COUNT(*) AS total FROM memory_nodes').get().total;
    } catch {
      memoryNodes = 0;
    }
    return { handoffs, latestHandoffs, memoryNodes };
  } finally {
    db.close();
  }
}

function readWorkflow(project) {
  initWorkspace();
  const file = path.join(getProjectsDir(), project, 'memory/60-runs/workflow.json');
  try { return applyArtifactProgress(project, JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { return null; }
}

function readStageStatus(project, stage) {
  try {
    const content = fs.readFileSync(path.join(getWorkspaceSpecsDir(), slugify(project), `${stage}.md`), 'utf8');
    const match = content.match(FILE_STATUS_RE);
    return match ? match[1].toLowerCase() : 'unknown';
  } catch {
    return null;
  }
}

function stageDone(status) {
  return ['approved', 'implementing', 'done'].includes(status);
}

function applyArtifactProgress(project, workflow) {
  if (!workflow?.kanban) return workflow;
  const slug = slugify(project);
  const projectsDir = getProjectsDir();
  const byId = new Map(workflow.kanban.map(step => [step.id, step]));
  const set = (id, status) => {
    const step = byId.get(id);
    if (!step) return;
    if (step.status === 'done' && status !== 'done') return;
    step.status = status;
  };
  const specStatus = readStageStatus(project, 'spec');
  const planStatus = readStageStatus(project, 'plan');
  const tasksStatus = readStageStatus(project, 'tasks');
  if (fs.existsSync(path.join(projectsDir, project, 'docs/project-brief.md'))) set('briefing', 'done');
  if (fs.existsSync(path.join(projectsDir, project)) && specStatus) set('structure', 'done');
  if (fs.existsSync(path.join(projectsDir, project, 'memory/40-delivery/current-sprint.md'))) set('sprints', 'done');
  if (stageDone(specStatus)) set('spec', 'done');
  if (fs.existsSync(path.join(projectsDir, project, 'memory/20-architecture/design-brief.md'))) set('design', 'done');
  if (stageDone(planStatus)) set('plan', 'done');
  if (tasksStatus === 'done') set('implement', 'done');
  else if (tasksStatus || fs.existsSync(path.join(projectsDir, project, 'memory/20-architecture/stack.md'))) set('implement', 'running');
  return { ...workflow, projectSlug: workflow.projectSlug || slug };
}

function fileGate(label, fullPath) {
  return {
    label,
    ok: fs.existsSync(fullPath),
    path: fullPath,
  };
}

function projectGates(project) {
  initWorkspace();
  const slug = slugify(project);
  const projectsDir = getProjectsDir();
  const specsDir = getWorkspaceSpecsDir();
  const contextDir = getWorkspaceContextDir();
  const workflow = readWorkflow(project);
  const steps = [...(workflow?.kanban || [])].sort((a, b) => (a.order || 999) - (b.order || 999));
  const currentStep = steps.find(step => step.status !== 'done') || steps[steps.length - 1] || null;
  const gates = [
    fileGate('GSD runbook', path.join(contextDir, `gsd-${slug}.md`)),
    fileGate('Spec', path.join(specsDir, slug, 'spec.md')),
    fileGate('Stack', path.join(projectsDir, project, 'memory/20-architecture/stack.md')),
    fileGate('Design brief', path.join(projectsDir, project, 'memory/20-architecture/design-brief.md')),
  ];
  const doneSteps = steps.filter(step => step.status === 'done').length;
  return {
    project,
    workflow: workflow ? {
      updatedAt: workflow.updatedAt,
      currentStep: currentStep ? {
        id: currentStep.id,
        title: currentStep.title,
        status: currentStep.status,
        role: currentStep.role,
        order: currentStep.order,
      } : null,
      progress: steps.length ? Math.round((doneSteps / steps.length) * 100) : 0,
    } : null,
    gates,
    gatesOk: gates.filter(gate => gate.ok).length,
    gatesTotal: gates.length,
  };
}

export default async function systemRoutes(app) {
  app.get('/api/system/overview', async () => {
    const projects = await listProjectNames();
    const summary = dbSummary();
    const projectStatus = projects.map(project => projectGates(project));
    return {
      generatedAt: new Date().toISOString(),
      counts: {
        projects: projects.length,
        handoffsOpen: (summary.handoffs.open || 0) + (summary.handoffs.in_progress || 0),
        handoffsDone: summary.handoffs.done || 0,
        handoffsArchived: summary.handoffs.archived || 0,
        memoryNodes: summary.memoryNodes,
      },
      handoffs: summary.handoffs,
      latestHandoffs: summary.latestHandoffs,
      projects: projectStatus,
    };
  });
}
