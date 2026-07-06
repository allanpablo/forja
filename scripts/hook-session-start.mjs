#!/usr/bin/env node
/**
 * Hook SessionStart — imprime status do framework no início da sessão.
 *
 * Roda uma vez por sessão. Lê specs em aberto + handoffs pendentes do universal.db.
 * Output vai para additionalContext (carregado pelo Claude no system).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDbPath, ensureSchema } from './memory-schema.mjs';

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

async function openHandoffs() {
  ensureSchema({ silent: true });
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) return [];
  try {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(`SELECT id, from_agent, to_agent, intent, spec_slug FROM handoffs WHERE status='open' ORDER BY id DESC LIMIT 10`).all();
    db.close();
    return rows;
  } catch { return []; }
}

(async function main() {
  const specs = listSpecs();
  const handoffs = await openHandoffs();
  const lines = ['<framework-status>'];
  lines.push(`Framework: 2-projeto-agents (SDD + orquestração)`);
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
