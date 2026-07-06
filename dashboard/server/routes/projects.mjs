/**
 * GET /api/projects — lista de projetos em <repoRoot>/projects/.
 *
 * Cruza:
 *  - filesystem: projects/<name>/memory/ → memory_bytes
 *  - git: projects/<name>/.git → last_commit (null se não-git)
 *  - SQLite: handoffs por spec_slug (heurística: prefixo do slug bate com nome do projeto)
 *  - filesystem: specs/<slug>/spec.md com `Sprint alvo` ou path referenciando o projeto
 *
 * Decisão: a associação spec ↔ projeto é frouxa por design — projetos em projects/
 * têm vida própria. Só contamos handoffs/specs que tenham spec_slug começando por
 * <project-name> OU mencionando o nome no campo context.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import {
  getProjectsDir,
  getWorkspaceDbPath,
  initWorkspace,
} from '../../../lib/workspace.mjs';

const NAME_RE = /^[a-zA-Z0-9_-]+$/;
const ADMIN_STATUS = new Set(['active', 'paused', 'archived']);

function adminPath(projectPath) {
  return path.join(projectPath, 'project-admin.json');
}

function readAdmin(projectPath) {
  try {
    const raw = fsSync.readFileSync(adminPath(projectPath), 'utf8');
    const data = JSON.parse(raw);
    return {
      status: ADMIN_STATUS.has(data.status) ? data.status : 'active',
      updatedAt: data.updatedAt || null,
      notes: typeof data.notes === 'string' ? data.notes : '',
    };
  } catch {
    return { status: 'active', updatedAt: null, notes: '' };
  }
}

function writeAdmin(projectPath, patch) {
  const current = readAdmin(projectPath);
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  fsSync.writeFileSync(adminPath(projectPath), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

async function listProjectNames(projectsDir) {
  let entries;
  try { entries = await fs.readdir(projectsDir, { withFileTypes: true }); }
  catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && NAME_RE.test(e.name))
    .map(e => e.name)
    .sort();
}

async function dirSizeBytes(dir) {
  let total = 0;
  let stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = await fs.readdir(cur, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        stack.push(p);
      } else if (e.isFile()) {
        try { total += (await fs.stat(p)).size; } catch { /* ignore */ }
      }
    }
  }
  return total;
}

function lastCommit(projectPath) {
  return new Promise((resolve) => {
    const gitDir = path.join(projectPath, '.git');
    if (!fsSync.existsSync(gitDir)) return resolve(null);
    const proc = spawn('git', ['-C', projectPath, 'log', '-1', '--format=%cI%n%h%n%s'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 1500,
    });
    let out = '';
    proc.stdout.on('data', c => { out += c.toString('utf8'); });
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0 || !out.trim()) return resolve(null);
      const [iso, hash, ...subjectParts] = out.trim().split('\n');
      resolve({ iso, hash, subject: subjectParts.join('\n') });
    });
  });
}

function openDb() {
  initWorkspace();
  const dbPath = getWorkspaceDbPath();
  if (!fsSync.existsSync(dbPath)) return null;
  const db = new Database(dbPath, { readonly: true, timeout: 5000 });
  db.pragma('busy_timeout = 5000');
  return db;
}

function handoffsByProject(db, projectNames) {
  if (!db) return new Map();
  // bag de prefixos — projeto "ai-medico" pega specs como "ai-medico-foo"
  const rows = db.prepare(`
    SELECT spec_slug, status, COUNT(*) as n
    FROM handoffs
    WHERE spec_slug IS NOT NULL
    GROUP BY spec_slug, status
  `).all();
  const out = new Map(projectNames.map(n => [n, { open: 0, in_progress: 0, done: 0, cancelled: 0 }]));
  for (const r of rows) {
    const match = projectNames.find(name => r.spec_slug === name || r.spec_slug.startsWith(`${name}-`));
    if (!match) continue;
    const bucket = out.get(match);
    if (bucket[r.status] !== undefined) bucket[r.status] += r.n;
  }
  return out;
}

async function specsByProject(projectsDir, projectNames) {
  // specs de produto ficam no workspace specs/; framework specs ficam no repo raiz.
  // Aqui usamos o workspace specs/ para cruzar com projetos.
  const specsDir = path.resolve(projectsDir, '..', 'specs');
  const out = new Map(projectNames.map(n => [n, 0]));
  let slugs;
  try { slugs = await fs.readdir(specsDir); } catch { return out; }
  for (const slug of slugs) {
    if (slug.startsWith('_') || slug.startsWith('.')) continue;
    const match = projectNames.find(name => slug === name || slug.startsWith(`${name}-`));
    if (match) out.set(match, out.get(match) + 1);
  }
  return out;
}

export default async function projectsRoutes(app) {
  app.get('/api/projects', async () => {
    initWorkspace();
    const projectsDir = getProjectsDir();
    const names = await listProjectNames(projectsDir);
    if (!names.length) return [];

    const db = openDb();
    const handoffsBucket = handoffsByProject(db, names);
    const specsBucket = await specsByProject(projectsDir, names);
    if (db) db.close();

    const items = await Promise.all(names.map(async (name) => {
      const projectPath = path.join(projectsDir, name);
      const memoryDir = path.join(projectPath, 'memory');
      const [memBytes, commit] = await Promise.all([
        fsSync.existsSync(memoryDir) ? dirSizeBytes(memoryDir) : Promise.resolve(0),
        lastCommit(projectPath),
      ]);
      const admin = readAdmin(projectPath);
      const h = handoffsBucket.get(name) || { open: 0, in_progress: 0, done: 0, cancelled: 0 };
      return {
        name,
        path: projectPath,
        admin,
        specs_total: specsBucket.get(name) || 0,
        handoffs_open: h.open + h.in_progress,
        handoffs_breakdown: h,
        last_commit: commit,
        memory_bytes: memBytes,
      };
    }));

    return items;
  });

  app.post('/api/projects/:name/status', async (req, reply) => {
    const name = String(req.params.name || '').trim();
    if (!NAME_RE.test(name)) return reply.code(400).send({ error: 'invalid project', code: 'INVALID_PROJECT' });
    const status = String(req.body?.status || '').trim();
    if (!ADMIN_STATUS.has(status)) {
      return reply.code(400).send({ error: 'invalid status', code: 'INVALID_STATUS' });
    }
    initWorkspace();
    const projectPath = path.join(getProjectsDir(), name);
    if (!fsSync.existsSync(projectPath)) return reply.code(404).send({ error: 'project not found', code: 'PROJECT_NOT_FOUND' });
    const admin = writeAdmin(projectPath, { status });
    return { name, admin };
  });

  app.post('/api/projects/:name/notes', async (req, reply) => {
    const name = String(req.params.name || '').trim();
    if (!NAME_RE.test(name)) return reply.code(400).send({ error: 'invalid project', code: 'INVALID_PROJECT' });
    const notes = String(req.body?.notes || '').trim();
    initWorkspace();
    const projectPath = path.join(getProjectsDir(), name);
    if (!fsSync.existsSync(projectPath)) return reply.code(404).send({ error: 'project not found', code: 'PROJECT_NOT_FOUND' });
    const admin = writeAdmin(projectPath, { notes });
    return { name, admin };
  });
}
