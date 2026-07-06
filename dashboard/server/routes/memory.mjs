import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getWorkspaceDbPath, initWorkspace } from '../../../lib/workspace.mjs';

function dbPath() {
  initWorkspace();
  return getWorkspaceDbPath();
}

function openDb() {
  const file = dbPath();
  if (!fs.existsSync(file)) return null;
  const db = new Database(file, { readonly: true, timeout: 5000 });
  db.pragma('busy_timeout = 5000');
  return db;
}

function toInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function ftsQuery(input) {
  return String(input || '')
    .split(/\s+/)
    .map(token => token.replace(/[^A-Za-z0-9_\-À-ÿ]/g, '').trim())
    .filter(Boolean)
    .map(token => `"${token.replace(/"/g, '""')}"`)
    .join(' ');
}

export default async function memoryRoutes(app) {
  app.get('/api/memory/stats', async () => {
    const db = openDb();
    const dbFile = dbPath();
    if (!db) return { configured: false, dbPath: dbFile, projects: 0, nodes: 0, handoffs: 0, kinds: [], recent: [] };
    try {
      const projects = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
      const nodes = db.prepare('SELECT COUNT(*) AS n FROM memory_nodes').get().n;
      const handoffs = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='handoffs'").get().n
        ? db.prepare('SELECT COUNT(*) AS n FROM handoffs').get().n
        : 0;
      const kinds = db.prepare('SELECT kind, COUNT(*) AS total FROM memory_nodes GROUP BY kind ORDER BY total DESC').all();
      const recent = db.prepare(`
        SELECT n.id, n.path, n.kind, n.title, p.name AS project, n.updated_at AS updatedAt
        FROM memory_nodes n
        LEFT JOIN projects p ON p.id = n.project_id
        ORDER BY n.updated_at DESC
        LIMIT 12
      `).all();
      return { configured: true, dbPath: dbFile, projects, nodes, handoffs, kinds, recent };
    } finally {
      db.close();
    }
  });

  app.get('/api/memory/search', async (req, reply) => {
    const db = openDb();
    if (!db) return { configured: false, query: req.query?.q || '', results: [] };

    const rawQuery = String(req.query?.q || '').trim();
    const query = ftsQuery(rawQuery);
    const limit = toInt(req.query?.limit, 25, 1, 100);
    const kind = String(req.query?.kind || '').trim();
    const project = String(req.query?.project || '').trim();

    try {
      const filters = [];
      const params = [];
      if (kind) { filters.push('n.kind = ?'); params.push(kind); }
      if (project) { filters.push('p.name = ?'); params.push(project); }

      if (query) {
        const where = filters.length ? `AND ${filters.join(' AND ')}` : '';
        const results = db.prepare(`
          SELECT
            n.id,
            n.path,
            n.kind,
            n.title,
            p.name AS project,
            snippet(search_idx, 2, '<mark>', '</mark>', '...', 24) AS snippet
          FROM search_idx
          JOIN memory_nodes n ON n.id = search_idx.node_id
          LEFT JOIN projects p ON p.id = n.project_id
          WHERE search_idx MATCH ? ${where}
          ORDER BY rank
          LIMIT ?
        `).all(query, ...params, limit);
        return { configured: true, query: rawQuery, results };
      }

      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const results = db.prepare(`
        SELECT n.id, n.path, n.kind, n.title, p.name AS project, substr(n.content, 1, 220) AS snippet
        FROM memory_nodes n
        LEFT JOIN projects p ON p.id = n.project_id
        ${where}
        ORDER BY n.updated_at DESC
        LIMIT ?
      `).all(...params, limit);
      return { configured: true, query: rawQuery, results };
    } catch (err) {
      return reply.code(400).send({ error: err.message, code: 'MEMORY_SEARCH_FAILED' });
    } finally {
      db.close();
    }
  });

  app.get('/api/memory/nodes/:id', async (req, reply) => {
    const id = toInt(req.params.id, 0, 1, Number.MAX_SAFE_INTEGER);
    if (!id) return reply.code(400).send({ error: 'invalid id', code: 'INVALID_ID' });
    const db = openDb();
    if (!db) return reply.code(404).send({ error: 'memory db not found', code: 'DB_NOT_FOUND' });
    try {
      const node = db.prepare(`
        SELECT n.id, n.path, n.kind, n.title, n.content, n.updated_at AS updatedAt, p.name AS project
        FROM memory_nodes n
        LEFT JOIN projects p ON p.id = n.project_id
        WHERE n.id = ?
      `).get(id);
      if (!node) return reply.code(404).send({ error: 'node not found', code: 'NODE_NOT_FOUND' });
      return node;
    } finally {
      db.close();
    }
  });
}
