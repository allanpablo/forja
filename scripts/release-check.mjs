#!/usr/bin/env node
/**
 * release-check — o gate do tarball (SPEC-010, ADR-0024).
 *
 * Responde a uma pergunta com evidência: **o pacote funciona na máquina de quem instala?**
 * Empacota, instala num diretório isolado, executa os comandos e reprova se algo só funcionava
 * porque o repo estava por perto.
 *
 *   npm run release:check              árvore suja = aviso   (smoke local)
 *   npm run release:check -- --publish árvore suja = falha   (prepublishOnly, CI de release)
 *
 * Diagnostica e autoriza; nunca publica. `npm publish` continua sendo um ato humano.
 */

import { runReleaseChecks, worstStatus } from '../lib/core/release.ts';

const TAG = { ok: 'OK   ', warn: 'AVISO', fail: 'FALHA', skipped: '—    ' };

async function main() {
  const publish = process.argv.includes('--publish');

  console.log(`\nForja release gate${publish ? ' (modo publish)' : ''}\n`);
  console.log('Empacotando e instalando num diretório isolado — isto leva alguns instantes.\n');

  const results = await runReleaseChecks({ publish });

  for (const r of results) {
    console.log(`${TAG[r.status]} ${r.id.padEnd(17)} ${r.detail}`);
    if (r.fix) console.log(`      corrigir: ${r.fix}`);
    console.log('');
  }

  const verdict = worstStatus(results);

  if (verdict === 'fail') {
    const raiz = results.filter((r) => r.status === 'fail' && r.severity === 'critical');
    console.log(`REPROVADO — ${raiz.length} falha(s) crítica(s). O pacote não deve ser publicado.`);
    for (const r of raiz) console.log(`  ${r.id}: ${r.fix || 'sem correção automática'}`);
    process.exit(1);
  }

  if (verdict === 'warn') {
    console.log('Aprovado com ressalvas. Nada impede o pacote de funcionar.');
    if (!publish) console.log('Para o parecer de publicação, rode com --publish.');
    return;
  }

  console.log('APROVADO — instalação limpa funciona.');
  console.log('O parecer é perecível: vale para este disco, neste instante. Qualquer npm install ou');
  console.log('edição posterior o invalida.');
}

main().catch((err) => {
  console.error(`\nrelease-check falhou: ${err.message}`);
  process.exit(1);
});
