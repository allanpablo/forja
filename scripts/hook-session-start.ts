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

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runChecks, bucketFor, BUCKET_LABEL } from '../lib/core/health.ts';
import { listSpecs } from '../lib/specs-index.ts';
import { openHandoffs } from '../lib/handoffs-index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

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
  const specs = listSpecs(root);
  const health = await coreHealth();
  const problemas = health.filter((c) => c.status === 'fail' || c.status === 'warn');
  const memoriaOk = !health.some((c) => c.status === 'fail');
  const handoffs = memoriaOk ? await openHandoffs() : [];

  const lines = ['<framework-status>'];
  lines.push(`Framework: forja (SDD + orquestração)`);

  if (problemas.length) {
    lines.push('');
    for (const bucket of ['blocking', 'first-run'] as const) {
      const grp = problemas.filter((p) => bucketFor(p.id) === bucket);
      if (!grp.length) continue;
      lines.push(`${BUCKET_LABEL[bucket]}:`);
      for (const p of grp) {
        const icone = p.status === 'fail' ? '✖' : '⚠';
        lines.push(`  ${icone} ${p.title}: ${p.detail}`);
        if (p.fix) lines.push(`    corrigir: ${p.fix}`);
      }
      if (bucket === 'first-run') lines.push('    (ou rode tudo: `npm run setup`)');
    }
    lines.push('  raio-x completo: `npm run tools:doctor`');
  }

  if (specs.length) {
    lines.push('\nSpecs ativas:');
    for (const s of specs) lines.push(`  - ${s.slug} [${s.status}]`);
  }
  if (handoffs.length) {
    lines.push('\nHandoffs em aberto:');
    for (const h of handoffs) lines.push(`  - #${h.id} ${h.from} → ${h.to} (${h.intent}) ${h.slug || ''}`);
  }
  lines.push('\nFluxo SDD: `npm run spec:new|plan|tasks|check`  ·  detalhe: `forja help <comando>`');
  lines.push('Handoff: `npm run hermes:handoff -- \'<json ADR-0005>\'`');
  lines.push('</framework-status>');

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: lines.join('\n'),
    },
  }));
})();
