/**
 * GET  /api/handoffs?status=&to=&from=&spec=&limit=
 * GET  /api/handoffs/:id
 * POST /api/handoffs/:id/transition  body { to: "in_progress"|"done"|"cancelled"|"archived" }
 *
 * Contrato: plan §4.
 * Storage: better-sqlite3 leitura direta de universal.db.handoffs (ADR-0008).
 * Transição: shell-out para scripts/agent-router.mjs para manter a CLI canônica
 *            (qualquer side-effect — logs, eventos — fica num lugar só).
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { spawnWithEvents, publish, newSource } from '../lib/events.mjs';
import { getWorkspaceDbPath, initWorkspace } from '../../../lib/workspace.mjs';

const VALID_STATUS = new Set(['open', 'in_progress', 'done', 'cancelled', 'archived']);
const TRANSITION_TARGETS = new Set(['in_progress', 'done', 'cancelled', 'archived']);
const AGENT_ROUTER_CMD = {
  in_progress: 'in_progress',
  done: 'done',
  cancelled: 'cancel',
  archived: 'archive',
};

function openDb() {
  initWorkspace();
  const dbPath = getWorkspaceDbPath();
  if (!fs.existsSync(dbPath)) {
    const err = new Error(`universal.db ausente em ${dbPath}`);
    err.code = 'DB_MISSING';
    throw err;
  }
  const db = new Database(dbPath, { readonly: true, timeout: 5000 });
  db.pragma('busy_timeout = 5000');
  return db;
}

export default async function handoffsRoutes(app, { repoRoot }) {
  app.get('/api/handoffs', async (req, reply) => {
    const { status, to, from, spec, limit = '50' } = req.query || {};
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
    const filters = [];
    const params = [];
    if (status) {
      if (!VALID_STATUS.has(status)) return reply.code(400).send({ error: 'invalid status', code: 'INVALID_STATUS' });
      filters.push('status = ?'); params.push(status);
    }
    if (to) { filters.push('to_agent = ?'); params.push(to); }
    if (from) { filters.push('from_agent = ?'); params.push(from); }
    if (spec) { filters.push('spec_slug = ?'); params.push(spec); }

    let db;
    try { db = openDb(); }
    catch (err) {
      if (err.code === 'DB_MISSING') return [];
      throw err;
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = db.prepare(
      `SELECT id, created_at, from_agent, to_agent, intent, status, spec_slug, context, acceptance, constraints, return_to
       FROM handoffs ${where} ORDER BY id DESC LIMIT ?`
    ).all(...params, lim);
    db.close();
    return rows;
  });

  app.get('/api/handoffs/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!id || id < 1) return reply.code(400).send({ error: 'invalid id', code: 'INVALID_ID' });
    let db;
    try { db = openDb(); }
    catch (err) {
      if (err.code === 'DB_MISSING') return reply.code(404).send({ error: 'handoff not found', code: 'HANDOFF_NOT_FOUND' });
      throw err;
    }
    const row = db.prepare('SELECT * FROM handoffs WHERE id = ?').get(id);
    db.close();
    if (!row) return reply.code(404).send({ error: 'handoff not found', code: 'HANDOFF_NOT_FOUND' });
    return row;
  });

  app.post('/api/handoffs/:id/transition', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!id || id < 1) return reply.code(400).send({ error: 'invalid id', code: 'INVALID_ID' });
    const target = req.body?.to;
    if (!target || !TRANSITION_TARGETS.has(target)) {
      return reply.code(400).send({
        error: `invalid target; expected one of ${[...TRANSITION_TARGETS].join('|')}`,
        code: 'INVALID_TARGET',
      });
    }

    const source = newSource();
    const result = await spawnWithEvents(
      'node',
      ['scripts/agent-router.mjs', AGENT_ROUTER_CMD[target], String(id)],
      { cwd: repoRoot, name: `agent-router ${AGENT_ROUTER_CMD[target]} #${id}`, source },
    );
    if (result.code !== 0) {
      const message = (result.stderr || result.stdout || '').trim();
      const isNotFound = /não encontrado/i.test(message);
      return reply.code(isNotFound ? 404 : 500).send({
        error: message || 'router exited non-zero',
        code: isNotFound ? 'HANDOFF_NOT_FOUND' : 'ROUTER_FAILED',
        source,
      });
    }
    publish('handoff.transitioned', { id, status: target, source });
    return { id, status: target, source };
  });
}
