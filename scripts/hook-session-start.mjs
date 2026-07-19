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
 *
 * A saúde do núcleo vem de `lib/core/health.mjs` — zero heurística local (SPEC-009). O hook tinha
 * a sua, e ela mentia: um `catch { return null }` colapsava "sem node_modules", "ABI incompatível"
 * e "banco ausente" no mesmo `null`, e então prescrevia `npm install` — que não recompila binário
 * nativo. Quem seguisse o conselho do próprio framework não consertava nada.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runChecks } from '../lib/core/health.ts';

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

/** Handoffs só fazem sentido com a memória de pé — daí o `memoriaOk` do caller. */
async function openHandoffs() {
  try {
    const { getWorkspaceDbPath } = await import('../lib/workspace.mjs');
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(getWorkspaceDbPath(), { readonly: true });
    const rows = db.prepare(`SELECT id, from_agent, to_agent, intent, spec_slug FROM handoffs WHERE status='open' ORDER BY id DESC LIMIT 10`).all();
    db.close();
    return rows;
  } catch { return []; }
}

/**
 * Nunca lança e nunca trava a sessão: o hook reporta, o `tools:doctor` é que é gate. Se a própria
 * lib de health não carregar, seguimos com o resto do briefing em vez de abortar (ADR-0021).
 */
async function coreHealth() {
  try {
    return await runChecks({ scope: 'runtime' });
  } catch { return []; }
}

(async function main() {
  const specs = listSpecs();
  const health = await coreHealth();
  const problemas = health.filter((c) => c.status === 'fail' || c.status === 'warn');
  const memoriaOk = !health.some((c) => c.status === 'fail');
  const handoffs = memoriaOk ? await openHandoffs() : [];

  const lines = ['<framework-status>'];
  lines.push(`Framework: forja (SDD + orquestração)`);

  if (problemas.length) {
    lines.push('');
    for (const p of problemas) {
      const icone = p.status === 'fail' ? '✖' : '⚠';
      lines.push(`${icone} ${p.title}: ${p.detail}`);
      if (p.fix) lines.push(`  corrigir: ${p.fix}`);
    }
    lines.push('  raio-x completo: `npm run tools:doctor`');
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
