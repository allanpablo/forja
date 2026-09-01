#!/usr/bin/env node
/**
 * evidence:show (SPEC-035)
 *
 *   forja evidence:show <run-id>     view agregada de evidência de um run: intent, agente, testes,
 *                                     aprovações, arquivos alterados — tudo já persistido
 *
 * `packages/engineering/evidence` faz o mapeamento puro; este script busca o `RuntimeRun` real
 * (`SqliteRuntimeRunStore`), os `AuditRecord`s cujo `aggregateId` é o run (`SqliteAuditStore`) e as
 * `ApprovalRequest`s cujo `correlationId` é o run (`ApprovalLedger`) — nenhuma tabela nova.
 */

import fs from 'node:fs';
import Database from 'better-sqlite3';
import { buildEvidenceLedger } from '../packages/engineering/evidence/src/index.ts';
import { ApprovalLedger } from '../packages/policy/src/index.ts';
import { SqliteApprovalStore, SqliteAuditStore, SqliteMigrationRunner, SqliteRuntimeRunStore } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import type { RunId } from '../packages/contracts/src/index.ts';

function cmdShow([runId]: string[]): void {
  if (!runId) { console.error('Uso: forja evidence:show <run-id>'); process.exitCode = 1; return; }

  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const database = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(database).apply();
  try {
    const run = new SqliteRuntimeRunStore(database).get(runId as RunId);
    if (run === undefined) { console.error(`Run não encontrado: ${runId}.`); process.exitCode = 1; return; }

    const auditRecords = new SqliteAuditStore(database).list().filter((record) => record.aggregateId === runId);
    const approvals = new ApprovalLedger(new SqliteApprovalStore(database)).list().filter((request) => request.correlationId === runId);

    const record = buildEvidenceLedger({ run, auditRecords, approvals });
    console.log(JSON.stringify(record, null, 2));
  } finally {
    database.close();
  }
}

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);
  switch (subcommand) {
    case 'show': return cmdShow(rest);
    default:
      console.error('Uso: forja evidence:show <run-id>');
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nevidence: falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
