#!/usr/bin/env node
/**
 * audit:sync — projeta o `.context/forja-runs.jsonl` na tabela consultável `audit_runs` (SPEC-014).
 * Idempotente. O `.jsonl` segue sendo a fonte de verdade; esta tabela é reconstruível.
 */
import { syncAudit, defaultEnv } from '../lib/audit.ts';

try {
  const r = await syncAudit(defaultEnv());
  if (r.total === 0) {
    console.log('Nenhum run auditado ainda. A trilha nasce em .context/forja-runs.jsonl conforme você usa o forja.');
  } else {
    console.log(`Auditoria sincronizada: ${r.ingested} novo(s), ${r.total} no total${r.skipped ? `, ${r.skipped} linha(s) corrompida(s) pulada(s)` : ''}.`);
  }
} catch (err) {
  console.error(`audit:sync indisponível: ${/** @type {any} */ (err).message}. A memória do workspace abriu? Rode: forja tools:doctor`);
  process.exit(1);
}
