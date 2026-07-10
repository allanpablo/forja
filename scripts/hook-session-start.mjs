#!/usr/bin/env node
/**
 * Hook SessionStart — imprime status do framework no início da sessão.
 *
 * Roda uma vez por sessão. Lê specs em aberto + handoffs pendentes do universal.db.
 * Output vai para additionalContext (carregado pelo Claude no system).
 *
 * Regra de ouro: este hook nunca pode derrubar a sessão. Todo acesso a SQLite é
 * lazy e envolto em try/catch — sem `node_modules`, degrada para o modo só-specs
 * em vez de abortar (ADR-0021).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function safeReadDir(p) { try { return fs.readdirSync(p); } catch { return []; } }

function listSpecs() {
  const specsDir = path.join(root, 'specs');
  const out = [];
  for (const slug of safeReadDir(specsDir)) {
    if (slug.startsWith('_') || slug.startsWith('.')) continue;
    const specPath = path.join(specsDir, slug, 'spec.md');
    if (!fs.existsSync(specPath)) continue;
    const c = fs.readFileSync(specPath, 'utf8');
    const m = c.match(/-\s*\*\*Status\*\*:\s*([a-z]+)/i);
    out.push({ slug, status: m ? m[1] : 'unknown' });
  }
  return out;
}

/** Lazy: sem better-sqlite3 instalado, devolve null em vez de estourar. */
async function resolveDbPath() {
  try {
    const { getDbPath, ensureSchema } = await import('./memory-schema.mjs');
    ensureSchema({ silent: true });
    const dbPath = getDbPath();
    return fs.existsSync(dbPath) ? dbPath : null;
  } catch { return null; }
}

async function openHandoffs(dbPath) {
  if (!dbPath) return [];
  try {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(`SELECT id, from_agent, to_agent, intent, spec_slug FROM handoffs WHERE status='open' ORDER BY id DESC LIMIT 10`).all();
    db.close();
    return rows;
  } catch { return []; }
}

/** mtime do arquivo .md mais recente sob memory/, ignorando o que é arquivado. */
function newestMemoryMtime(dir = path.join(root, 'memory'), acc = { t: 0 }) {
  for (const entry of safeReadDir(dir)) {
    if (entry.startsWith('.') || entry === 'archive') continue;
    const p = path.join(dir, entry);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) newestMemoryMtime(p, acc);
    else if (entry.endsWith('.md') && st.mtimeMs > acc.t) acc.t = st.mtimeMs;
  }
  return acc.t;
}

/**
 * Índice defasado = `query:universal` responde sobre memória velha, calado.
 * É a falha mais cara do framework: erra sem avisar. Então avisamos.
 */
function staleIndex(dbPath) {
  if (!dbPath) return false;
  try {
    const dbMtime = fs.statSync(dbPath).mtimeMs;
    return newestMemoryMtime() > dbMtime;
  } catch { return false; }
}

(async function main() {
  const specs = listSpecs();
  const dbPath = await resolveDbPath();
  const handoffs = await openHandoffs(dbPath);
  const lines = ['<framework-status>'];
  lines.push(`Framework: forja (SDD + orquestração)`);

  if (!dbPath) {
    lines.push('\n⚠ Memória indisponível: universal.db não abriu. Rode `npm install` e `npm run sync:universal`.');
  } else if (staleIndex(dbPath)) {
    lines.push('\n⚠ Índice defasado: memory/ mudou depois do último sync. `query:universal` vai responder sobre memória velha — rode `npm run sync:universal`.');
  }

  if (specs.length) {
    lines.push('\nSpecs ativas:');
    for (const s of specs) lines.push(`  - ${s.slug} [${s.status}]`);
  }
  if (handoffs.length) {
    lines.push('\nHandoffs em aberto:');
    for (const h of handoffs) lines.push(`  - #${h.id} ${h.from_agent} → ${h.to_agent} (${h.intent}) ${h.spec_slug || ''}`);
  }
  lines.push('\nFluxo SDD: `npm run spec:new|plan|tasks|check`');
  lines.push('Handoff: `node scripts/agent-router.mjs append <json>`');
  lines.push('</framework-status>');

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: lines.join('\n'),
    },
  }));
})();
