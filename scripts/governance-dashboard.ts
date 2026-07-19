#!/usr/bin/env node
/**
 * governance:dashboard — gera um painel HTML estático de governança (SPEC-014).
 *
 * Lê specs, ADRs, o registry e a trilha de auditoria; escreve um arquivo. **Não executa nada** — é
 * a resposta correta ao ADR-0022 (o dashboard antigo era servidor com rotas; este é artefato).
 *
 * Uso: forja governance:dashboard [--out <arquivo>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { collect, renderHtml } from '../lib/governance-report.ts';
import { getWorkspaceContextDir, ensureDir } from '../lib/workspace.ts';

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
let out = outIdx >= 0 ? argv[outIdx + 1] : null;

if (!out) {
  try {
    out = path.join(ensureDir(getWorkspaceContextDir()), 'governance.html');
  } catch {
    out = path.join(process.cwd(), 'governance.html');
  }
}

try {
  const data = await collect();
  fs.writeFileSync(out, renderHtml(data), 'utf8');
  const audit = data.audit ? `${data.audit.total} runs auditados` : 'sem atividade auditada ainda';
  console.log(`Painel gerado: ${out}`);
  console.log(`  ${data.metrics.specs} specs · ${data.metrics.adrs} ADRs · ${data.gates.length} gates · ${audit}`);
  console.log('  Abra com file:// — é estático, sem servidor (ADR-0022).');
} catch (err) {
  console.error(`governance:dashboard falhou: ${/** @type {any} */ (err).message}`);
  process.exit(1);
}
