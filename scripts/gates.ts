#!/usr/bin/env node
/**
 * check:all — a bateria inteira de gates do framework, um veredito (SPEC-020).
 *
 *   forja check:all               coerência (doctor) + projeto gerado (smoke barato)
 *   forja check:all --full        + tarball (release:check) + build do gerado (smoke --full)
 *   forja check:all --with-drift  + drift:check (SPEC-030) — opt-in, não roda por padrão (custo de
 *                                  reindexar o workspace inteiro não foi medido em repos grandes)
 *
 * Não substitui os gates focados — os agrega. "A casa está coerente?" num comando só.
 */

import { runGates, overallStatus } from '../lib/core/gates.ts';

const TAG = { ok: 'OK   ', warn: 'AVISO', fail: 'FALHA', skipped: '—    ' };

async function main() {
  const full = process.argv.includes('--full');
  const withDrift = process.argv.includes('--with-drift');

  console.log(`\nForja check:all${full ? ' (--full)' : ''}${withDrift ? ' (--with-drift)' : ''} — a bateria inteira, um veredito\n`);
  if (full) console.log('Inclui os gates caros (empacota o tarball, builda o backend gerado) — leva minutos.\n');
  if (withDrift) console.log('Inclui drift:check (SPEC-030) — reindexa o workspace inteiro por extração determinística.\n');

  const groups = await runGates({ full, withDrift });

  for (const g of groups) {
    console.log(`▚ ${g.name}`);
    for (const r of g.results) {
      console.log(`  ${(TAG as any)[r.status] ?? r.status} ${String(r.id).padEnd(18)} ${r.detail}`);
    }
    console.log('');
  }

  const verdict = overallStatus(groups);

  if (verdict === 'fail') {
    const criticos = groups.flatMap((g) => g.results).filter((r: any) => r.status === 'fail' && r.severity === 'critical');
    console.log(`REPROVADO — ${criticos.length} gate(s) crítico(s) falharam:`);
    for (const r of criticos) console.log(`  ${r.id}: ${r.fix || 'sem correção automática'}`);
    process.exit(1);
  }

  if (verdict === 'warn') {
    console.log('Aprovado com ressalvas. Nada crítico falhou.');
    if (!full) console.log('Para os gates caros (tarball, build do gerado), rode com --full.');
    return;
  }

  console.log(full ? 'APROVADO — a bateria inteira passou.' : 'APROVADO. Para os gates caros, rode com --full.');
}

main().catch((err) => {
  console.error(`\ncheck:all falhou: ${err.message}`);
  process.exit(1);
});
