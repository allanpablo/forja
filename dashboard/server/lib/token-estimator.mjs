/**
 * token-estimator — agrega tamanho de packs de contexto e runs por dia.
 *
 * Fórmula: bytes / 4 ≈ tokens (heurística OpenAI-style, vale também para Anthropic
 * com erro ≤25% em texto natural). Rotulado como ESTIMATIVA na resposta.
 *
 * Fontes:
 *  - projects/<name>/.context/*.md            → contexto enviado a agentes
 *  - projects/<name>/memory/60-runs/*.json    → logs de execução com bytes_in/out se presentes
 *  - .context/*.md (no root)                  → contexto do framework (project=__framework__)
 *
 * Decisão D7: zero chamada de API externa. Custo aproximado em USD usa price_per_1k
 * passado pelo caller (default vazio).
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {
  getProjectsDir,
  getWorkspaceContextDir,
  initWorkspace,
} from '../../../lib/workspace.mjs';

export const CHARS_PER_TOKEN = 4;

function toDate(stat) {
  const d = new Date(stat.mtimeMs);
  return d.toISOString().slice(0, 10);
}

async function collectFromDir(dir, ext) {
  if (!fsSync.existsSync(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (ext && !e.name.endsWith(ext)) continue;
    const p = path.join(dir, e.name);
    try {
      const stat = await fs.stat(p);
      out.push({ path: p, bytes: stat.size, date: toDate(stat) });
    } catch { /* ignore */ }
  }
  return out;
}

async function readRunFile(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const j = JSON.parse(raw);
    if (typeof j.tokens_in === 'number' || typeof j.tokens_out === 'number') {
      return { tokens_in: j.tokens_in || 0, tokens_out: j.tokens_out || 0 };
    }
    if (typeof j.bytes_in === 'number') {
      return { tokens_in: Math.round((j.bytes_in || 0) / CHARS_PER_TOKEN), tokens_out: Math.round((j.bytes_out || 0) / CHARS_PER_TOKEN) };
    }
    return null;
  } catch { return null; }
}

/**
 * @param {string} repoRoot
 * @param {{ project?: string|null, days?: number }} [opts]
 */
export async function estimateTokens(repoRoot, opts = {}) {
  initWorkspace();
  const days = Math.min(Math.max(opts.days || 30, 1), 365);
  const cutoff = Date.now() - days * 86400_000;
  const cutoffISO = new Date(cutoff).toISOString().slice(0, 10);

  // Determina lista de projetos a varrer
  let projects;
  if (opts.project && opts.project !== '__framework__') {
    projects = [opts.project];
  } else if (opts.project === '__framework__') {
    projects = [];
  } else {
    const projectsDir = getProjectsDir();
    try {
      const entries = await fs.readdir(projectsDir, { withFileTypes: true });
      projects = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);
    } catch { projects = []; }
  }

  const byDayProject = new Map(); // key: `${date}::${project}` → { tokens_in, tokens_out, files }

  function bump(date, project, tokensIn, tokensOut) {
    const key = `${date}::${project}`;
    const cur = byDayProject.get(key) || { date, project, tokens_in: 0, tokens_out: 0, files: 0 };
    cur.tokens_in += tokensIn;
    cur.tokens_out += tokensOut;
    cur.files += 1;
    byDayProject.set(key, cur);
  }

  // Framework-level .context/ (continua no repo do framework)
  if (!opts.project || opts.project === '__framework__') {
    const files = await collectFromDir(path.join(repoRoot, '.context'), '.md');
    for (const f of files) {
      if (f.date < cutoffISO) continue;
      bump(f.date, '__framework__', Math.round(f.bytes / CHARS_PER_TOKEN), 0);
    }
  }

  // Por projeto (workspace)
  const projectsDir = getProjectsDir();
  for (const p of projects) {
    const ctxDir = path.join(projectsDir, p, '.context');
    const runsDir = path.join(projectsDir, p, 'memory', '60-runs');

    const ctxFiles = await collectFromDir(ctxDir, '.md');
    for (const f of ctxFiles) {
      if (f.date < cutoffISO) continue;
      bump(f.date, p, Math.round(f.bytes / CHARS_PER_TOKEN), 0);
    }

    const runFiles = await collectFromDir(runsDir, '.json');
    for (const f of runFiles) {
      if (f.date < cutoffISO) continue;
      const parsed = await readRunFile(f.path);
      if (parsed) {
        bump(f.date, p, parsed.tokens_in, parsed.tokens_out);
      } else {
        bump(f.date, p, Math.round(f.bytes / CHARS_PER_TOKEN), 0);
      }
    }
  }

  const series = [...byDayProject.values()].sort((a, b) =>
    a.date === b.date ? a.project.localeCompare(b.project) : a.date.localeCompare(b.date)
  );

  return {
    method: 'estimate',
    formula: 'bytes / 4',
    days,
    cutoff: cutoffISO,
    series,
  };
}
