#!/usr/bin/env node
/**
 * audit:query — consulta a trilha de auditoria (SPEC-014).
 *   forja audit:query --failed            só as reprovações
 *   forja audit:query --cmd release:check por comando
 *   forja audit:query --since 7d          janela de tempo (Nd/Nh/Nm)
 */
import { queryAudit, defaultEnv } from '../lib/audit.ts';

function parseArgs(argv) {
  const o: { failed?: boolean; cmd?: string; since?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--failed') o.failed = true;
    else if (argv[i] === '--cmd') o.cmd = argv[++i];
    else if (argv[i] === '--since') o.since = argv[++i];
    else if (argv[i] === '--gate') o.cmd = argv[++i]; // gate é um comando; alias legível
  }
  return o;
}

try {
  const opts = parseArgs(process.argv.slice(2));
  const rows = await queryAudit(defaultEnv(), opts);

  if (!rows.length) {
    console.log('Nenhum run bate com o filtro. (Rodou `forja audit:sync` antes?)');
    process.exit(0);
  }

  const fails = rows.filter((r) => r.exitCode !== 0).length;
  console.log(`${rows.length} run(s)${fails ? `, ${fails} reprovação(ões)` : ''}:\n`);
  for (const r of rows.slice(0, 40)) {
    const flag = r.exitCode === 0 ? 'OK  ' : 'FAIL';
    const when = (r.ts || '').replace('T', ' ').slice(0, 16);
    console.log(`  ${flag} ${String(r.cmd).padEnd(22)} ${String(r.durationMs ?? '').padStart(6)}ms  ${when}`);
  }
  if (rows.length > 40) console.log(`  … +${rows.length - 40}`);
} catch (err) {
  console.error(`audit:query indisponível: ${/** @type {any} */ (err).message}. Rode: forja tools:doctor`);
  process.exit(1);
}
