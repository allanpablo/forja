/**
 * GET /api/specs              — lista resumida
 * GET /api/specs/:slug        — conteúdo cru de spec/plan/tasks
 *
 * Contrato: plan §4.
 * Fonte: filesystem em `<repoRoot>/specs/<slug>/{spec,plan,tasks}.md`.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSpec } from '../lib/spec-parser.mjs';
import { spawnWithEvents, publish, newSource } from '../lib/events.mjs';
import { syncUniversal } from '../lib/repo-sync.mjs';
import { getWorkspaceSpecsDir, initWorkspace } from '../../../lib/workspace.mjs';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STAGES = new Set(['spec', 'plan', 'tasks']);
const GENERATED_STAGES = new Set(['plan', 'tasks']);
const STATUSES = new Set(['draft', 'review', 'approved', 'implementing', 'done', 'abandoned']);

async function safeRead(p) {
  try { return await fs.readFile(p, 'utf8'); }
  catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function listSlugs(specsDir) {
  let entries;
  try { entries = await fs.readdir(specsDir, { withFileTypes: true }); }
  catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort();
}

export default async function specsRoutes(app, { repoRoot }) {
  initWorkspace();
  const specsDir = getWorkspaceSpecsDir();

  app.get('/api/specs', async () => {
    const slugs = await listSlugs(specsDir);
    const items = await Promise.all(slugs.map(async (slug) => {
      const specPath = path.join(specsDir, slug, 'spec.md');
      const planPath = path.join(specsDir, slug, 'plan.md');
      const tasksPath = path.join(specsDir, slug, 'tasks.md');
      const [specContent, planExists, tasksExists] = await Promise.all([
        safeRead(specPath),
        fs.access(planPath).then(() => true, () => false),
        fs.access(tasksPath).then(() => true, () => false),
      ]);
      if (!specContent) return null;
      const meta = parseSpec(specContent);
      return {
        slug,
        status: meta.status || 'unknown',
        title: meta.title || slug,
        owner: meta.owner,
        sprint: meta.sprint,
        id: meta.id,
        createdAt: meta.createdAt,
        adrs: meta.adrs,
        file: `specs/${slug}/spec.md`,
        hasplan: planExists,
        hastasks: tasksExists,
      };
    }));
    return items.filter(Boolean);
  });

  app.post('/api/specs/:slug/status', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_RE.test(slug)) {
      return reply.code(400).send({ error: 'invalid slug', code: 'INVALID_SLUG' });
    }
    const { stage, status } = req.body || {};
    if (!STAGES.has(stage)) {
      return reply.code(400).send({ error: `stage must be one of ${[...STAGES].join('|')}`, code: 'INVALID_STAGE' });
    }
    if (!STATUSES.has(status)) {
      return reply.code(400).send({ error: `status must be one of ${[...STATUSES].join('|')}`, code: 'INVALID_STATUS' });
    }
    const stagePath = path.join(specsDir, slug, `${stage}.md`);
    let previous = null;
    try {
      const content = await fs.readFile(stagePath, 'utf8');
      const m = content.match(/-\s*\*\*Status\*\*:\s*([a-z]+)/i);
      previous = m ? m[1].toLowerCase() : null;
    } catch {
      return reply.code(404).send({ error: 'stage file not found', code: 'STAGE_NOT_FOUND' });
    }
    const source = newSource();
    const result = await spawnWithEvents('node', ['scripts/spec-cli.mjs', 'set-status', slug, stage, status], {
      cwd: repoRoot, name: `spec-cli set-status ${slug}/${stage} → ${status}`, source,
    });
    if (result.code !== 0) {
      return reply.code(500).send({
        error: (result.stderr || result.stdout || '').trim() || 'spec-cli falhou',
        code: 'SPEC_CLI_FAILED',
        source,
      });
    }
    publish('spec.status_changed', { slug, stage, from: previous, to: status, source });
    const sync = await syncUniversal(repoRoot, `spec-status:${slug}:${stage}`, { projectSlug: slug });
    return { slug, stage, from: previous, to: status, source, sync: { code: sync.code, source: sync.source } };
  });

  app.post('/api/specs/:slug/generate/:stage', async (req, reply) => {
    const { slug, stage } = req.params;
    if (!SLUG_RE.test(slug)) {
      return reply.code(400).send({ error: 'invalid slug', code: 'INVALID_SLUG' });
    }
    if (!GENERATED_STAGES.has(stage)) {
      return reply.code(400).send({ error: 'stage must be plan or tasks', code: 'INVALID_STAGE' });
    }

    const source = newSource();
    const result = await spawnWithEvents('node', ['scripts/spec-cli.mjs', stage, slug], {
      cwd: repoRoot, name: `spec-cli ${stage} ${slug}`, source,
    });
    if (result.code !== 0) {
      return reply.code(409).send({
        error: (result.stderr || result.stdout || '').trim() || 'spec-cli falhou',
        code: 'SPEC_CLI_FAILED',
        source,
      });
    }
    publish('spec.status_changed', { slug, stage, action: 'generated', source });
    const sync = await syncUniversal(repoRoot, `spec-generate:${slug}:${stage}`, { projectSlug: slug });
    return {
      slug,
      stage,
      file: `specs/${slug}/${stage}.md`,
      source,
      sync: { code: sync.code, source: sync.source },
    };
  });

  app.get('/api/specs/:slug', async (req, reply) => {
    const { slug } = req.params;
    if (!SLUG_RE.test(slug)) {
      return reply.code(400).send({ error: 'invalid slug', code: 'INVALID_SLUG' });
    }
    const dir = path.join(specsDir, slug);
    const [spec, plan, tasks] = await Promise.all([
      safeRead(path.join(dir, 'spec.md')),
      safeRead(path.join(dir, 'plan.md')),
      safeRead(path.join(dir, 'tasks.md')),
    ]);
    if (!spec) {
      return reply.code(404).send({ error: 'spec not found', code: 'SPEC_NOT_FOUND' });
    }
    return {
      slug,
      meta: parseSpec(spec),
      spec,
      plan,
      tasks,
    };
  });
}
