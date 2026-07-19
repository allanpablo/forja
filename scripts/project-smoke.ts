#!/usr/bin/env node
/**
 * project-smoke — o gate do projeto gerado (SPEC-015).
 *
 * Responde a uma pergunta com evidência: **o que `forja project:new` gera é coerente?**
 * Gera um projeto num diretório isolado e reprova se um template vazou, um `package.json` não
 * parseia, a estrutura está incompleta — ou, no tier `--full`, se o backend não buildar.
 *
 *   forja project:smoke            tier barato (placeholders, JSON, estrutura) — roda no CI
 *   forja project:smoke -- --full  + npm install && npm run build do backend gerado (lento, rede)
 *
 * É o `release:check` da saída do gerador, um nível acima do tarball.
 */

import { runProjectSmoke, worstStatus } from '../lib/core/project-smoke.ts';

const TAG = { ok: 'OK   ', warn: 'AVISO', fail: 'FALHA', skipped: '—    ' };

async function main() {
  const full = process.argv.includes('--full');

  console.log(`\nForja project smoke${full ? ' (tier --full)' : ''}\n`);
  console.log(`Gerando um projeto num diretório isolado${full ? ' e buildando o backend — isto leva minutos' : ''}.\n`);

  const results = await runProjectSmoke({ full });

  for (const r of results) {
    console.log(`${(TAG as any)[r.status]} ${r.id.padEnd(16)} ${r.detail}`);
    if (r.fix) console.log(`      corrigir: ${r.fix}`);
    console.log('');
  }

  const verdict = worstStatus(results);

  if (verdict === 'fail') {
    const raiz = results.filter((r: any) => r.status === 'fail' && r.severity === 'critical');
    console.log(`REPROVADO — ${raiz.length} falha(s) crítica(s). O gerador está entregando um projeto quebrado.`);
    for (const r of raiz) console.log(`  ${r.id}: ${r.fix || 'sem correção automática'}`);
    process.exit(1);
  }

  if (verdict === 'warn') {
    console.log('Aprovado com ressalvas.');
    return;
  }

  console.log(full ? 'APROVADO — o projeto gerado instala e compila.' : 'APROVADO — o projeto gerado é coerente. Para provar o build, rode com --full.');
}

main().catch((err) => {
  console.error(`\nproject-smoke falhou: ${err.message}`);
  process.exit(1);
});
