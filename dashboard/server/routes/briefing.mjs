/**
 * POST /api/briefing
 *  body: { brief: string, slug: string, projectHint?: string }
 *  → { slug, specPath, parsed }
 *
 * Cria spec via spec-cli (CLI canônica), sobrescreve seções 1-3 com a saída do
 * parser heurístico (D5). Status fica obrigatoriamente em "draft".
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { parseBriefing, renderSections } from '../lib/briefing-parser.mjs';
import { spawnWithEvents, publish, newSource } from '../lib/events.mjs';
import { syncUniversal } from '../lib/repo-sync.mjs';
import {
  getProjectsDir,
  getWorkspaceSpecsDir,
  initWorkspace,
} from '../../../lib/workspace.mjs';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

function insertSections(specContent, sectionsBlock) {
  // Mantém o cabeçalho + primeira section que começa com "## 1." até antes da próxima "##".
  // Substitui §1 a §3 por sectionsBlock.
  const lines = specContent.split('\n');
  const headerEnd = lines.findIndex(l => /^##\s+1\./.test(l));
  if (headerEnd === -1) return specContent + '\n\n' + sectionsBlock + '\n';
  const after = lines.findIndex((l, i) => i > headerEnd && /^##\s+4\./.test(l));
  const header = lines.slice(0, headerEnd).join('\n').trimEnd();
  const tail = after === -1 ? '' : lines.slice(after).join('\n');
  return `${header}\n\n${sectionsBlock}\n\n${tail}`.trimEnd() + '\n';
}

async function ensureProjectFromBriefing(slug, brief) {
  initWorkspace();
  const projectsDir = getProjectsDir();
  const projectDir = path.join(projectsDir, slug);
  const dirs = [
    'docs',
    'memory/40-delivery',
    'memory/50-orchestration',
    'memory/60-runs',
    'memory/70-summaries',
  ];
  await fs.mkdir(projectDir, { recursive: true });
  await Promise.all(dirs.map(dir => fs.mkdir(path.join(projectDir, dir), { recursive: true })));

  const briefPath = path.join(projectDir, 'docs/project-brief.md');
  if (!fsSync.existsSync(briefPath)) {
    await fs.writeFile(
      briefPath,
      `# Project Brief: ${slug}\n\n- **Slug**: ${slug}\n- **Criado em**: ${new Date().toISOString()}\n- **Spec**: ${path.join(getWorkspaceSpecsDir(), slug, 'spec.md')}\n\n## Briefing Original\n\n${brief.trim()}\n`,
      'utf8',
    );
  }
  return { path: projectDir, brief: briefPath };
}

async function appendInitialHandoff(repoRoot, slug, source) {
  const routerPath = path.join(repoRoot, 'scripts', 'agent-router.mjs');
  if (!fsSync.existsSync(routerPath)) {
    return { skipped: true, reason: 'agent-router missing' };
  }
  const payload = {
    from: 'product',
    to: 'sdd-architect',
    intent: 'plan',
    context: `Spec criada a partir do briefing em specs/${slug}/spec.md. Revisar problema, publico-alvo, criterios de aceite e preparar plan.md.`,
    acceptance: `plan.md criado em specs/${slug}/plan.md com abordagem tecnica, modulos afetados, contratos, decisoes, dependencias, rollout e kill criteria.`,
    constraints: 'Nao implementar codigo nesta etapa. Se a spec estiver incompleta, devolver para Product com lacunas objetivas.',
    return: 'product',
    spec_slug: slug,
  };
  const result = await spawnWithEvents('node', ['scripts/agent-router.mjs', 'append', JSON.stringify(payload)], {
    cwd: repoRoot, name: `agent-router append initial handoff ${slug}`, source,
  });
  return {
    skipped: false,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function readSpecTemplate(repoRoot) {
  const templatePath = path.join(repoRoot, 'specs', '_templates', 'spec.md');
  if (!fsSync.existsSync(templatePath)) {
    throw new Error('Template de spec não encontrado: specs/_templates/spec.md');
  }
  return fsSync.readFileSync(templatePath, 'utf8');
}

function fillTemplate(tpl, vars) {
  return tpl
    .replace(/{{FEATURE}}/g, vars.feature)
    .replace(/{{ID}}/g, vars.id)
    .replace(/{{OWNER}}/g, vars.owner || '—')
    .replace(/{{DATE}}/g, vars.date);
}

export default async function briefingRoutes(app, { repoRoot }) {
  app.post('/api/briefing', async (req, reply) => {
    const { brief, slug, projectHint } = req.body || {};
    if (!brief || typeof brief !== 'string' || brief.trim().length < 20) {
      return reply.code(400).send({ error: 'brief deve ter ao menos 20 chars', code: 'BRIEF_TOO_SHORT' });
    }
    if (!slug || !SLUG_RE.test(slug)) {
      return reply.code(400).send({ error: 'slug inválido (kebab-case, 2-64 chars)', code: 'INVALID_SLUG' });
    }
    if (projectHint && !/^[a-zA-Z0-9_-]+$/.test(projectHint)) {
      return reply.code(400).send({ error: 'projectHint inválido', code: 'INVALID_PROJECT_HINT' });
    }

    initWorkspace();
    const specDir = path.join(getWorkspaceSpecsDir(), slug);
    if (fsSync.existsSync(specDir)) {
      return reply.code(409).send({ error: 'spec slug já existe no workspace', code: 'SPEC_EXISTS' });
    }

    await fs.mkdir(specDir, { recursive: true });

    const source = newSource();

    // Cria spec a partir do template do framework, mas no workspace specs/
    const tpl = readSpecTemplate(repoRoot);
    const feature = slug.toLowerCase();
    const content = fillTemplate(tpl, {
      feature,
      id: `SPEC-${Date.now()}`,
      owner: 'dashboard-briefing',
      date: new Date().toISOString().slice(0, 10),
    });

    const parsed = parseBriefing(brief);
    const sectionsBlock = renderSections(parsed);

    const specPath = path.join(specDir, 'spec.md');
    const updated = insertSections(content, sectionsBlock);

    // Hard-enforce status=draft (parser nunca aprova).
    const safe = updated.replace(/-\s*\*\*Status\*\*:.*/i, '- **Status**: draft');

    // Adiciona nota sobre o projectHint se vier
    const withHint = projectHint
      ? safe.replace(/-\s*\*\*Sprint alvo\*\*:.*/i, m => `${m}\n- **Projeto-alvo**: ${projectHint}`)
      : safe;

    await fs.writeFile(specPath, withHint, 'utf8');
    const project = await ensureProjectFromBriefing(slug, brief);
    publish('spec.created', { slug, source });
    publish('project.created', { slug, source });
    const handoff = await appendInitialHandoff(repoRoot, slug, source);
    if (!handoff.skipped && handoff.code === 0) {
      publish('handoff.created', { slug, source });
    }
    const sync = await syncUniversal(repoRoot, `briefing:${slug}`, { projectSlug: slug });

    return {
      slug,
      specPath: path.relative(repoRoot, specPath),
      project,
      parsed,
      handoff,
      source,
      sync: { code: sync.code, source: sync.source },
    };
  });
}
