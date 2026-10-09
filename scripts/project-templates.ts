/**
 * forja project:templates — os boilerplates e o que dá para fazer com cada um (ADR-0088).
 * Template validado: `forja project:new <nome> --template <t>`. Referência: consulta/adaptação.
 */
import { listTemplates } from '../lib/templates.ts';

const all = listTemplates();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(all.map(({ dir, ...t }) => t), null, 2));
} else {
  const ready = all.filter((t) => t.ready);
  console.log('Templates (forja project:new <nome> --template <template>):');
  for (const t of ready) console.log(`  ${t.name.replace(/^\d+-/, '').padEnd(24)} ${t.title}${t.stack.length ? ` — ${t.stack.join(', ')}` : ''}`);
  if (!ready.length) console.log('  (nenhum)');
  console.log('\nReferência (consulte em boilerplates/<nome>/; ainda sem validação de build):');
  for (const t of all.filter((x) => !x.ready)) console.log(`  ${t.name.padEnd(26)} ${t.title}`);
}
