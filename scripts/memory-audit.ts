#!/usr/bin/env node
/**
 * memory:audit — os mapas de memória não mentem sobre o código (SPEC-017, ADR-0009).
 *
 *   forja memory:audit                    audita os mapas do projeto no cwd
 *   forja memory:audit --project <path>   aponta para outro projeto
 *
 * Para cada `memory/30-domains/<d>/context.md`, confere que todo path de código citado existe.
 * Um mapa que aponta para arquivo renomeado/deletado engana com confiança — este comando reprova.
 */

import path from 'node:path';
import { auditMemoryMaps } from '../lib/memory-audit.ts';

function main() {
  const i = process.argv.indexOf('--project');
  const projectRoot = path.resolve(i >= 0 ? process.argv[i + 1] : process.cwd());

  const audits = auditMemoryMaps(projectRoot);

  if (!audits.length) {
    console.log(`Nenhum mapa de domínio em ${path.join(projectRoot, 'memory/30-domains')}.`);
    console.log('Rode dentro de um projeto gerado, ou aponte com --project <path>.');
    return;
  }

  let totalDangling = 0;
  for (const a of audits) {
    if (a.dangling.length) {
      totalDangling += a.dangling.length;
      console.log(`✗ ${a.domain} (${a.mapPath}) — ${a.dangling.length}/${a.refs} referência(s) pendurada(s):`);
      for (const d of a.dangling) console.log(`    ${d} — o mapa aponta, o arquivo não existe`);
    } else {
      console.log(`✓ ${a.domain} — ${a.refs} referência(s), todas resolvem`);
    }
  }

  if (totalDangling) {
    console.log(`\nREPROVADO — ${totalDangling} referência(s) pendurada(s). O mapa mente; corrija o context.md ou o path.`);
    process.exit(1);
  }
  console.log('\nAPROVADO — todo mapa de memória aponta para código que existe.');
}

main();
