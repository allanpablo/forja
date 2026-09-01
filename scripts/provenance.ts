#!/usr/bin/env node
/**
 * provenance:record / blame / sbom (SPEC-039)
 *
 *   forja provenance:record <run-id>   extrai proveniência de um RuntimeRun já persistido e grava
 *   forja blame <file>                 histórico de proveniência de um arquivo, mais recente primeiro
 *   forja sbom [--json]                relatório agregado por agente
 *
 * `packages/engineering/provenance` faz o mapeamento puro (`extractProvenance`); este script busca
 * o `RuntimeRun` real (`SqliteRuntimeRunStore`, já existente) e persiste via `SqliteProvenanceStore`
 * (reaproveita `SqliteJsonRepository`, sem migration nova). Granularidade é arquivo, não linha —
 * ver AC-2 da spec: nenhuma fonte de dado real deste repositório rastreia hunks de linha por run.
 */

import fs from 'node:fs';
import Database from 'better-sqlite3';
import { extractProvenance } from '../packages/engineering/provenance/src/index.ts';
import { SqliteMigrationRunner, SqliteProvenanceStore, SqliteRuntimeRunStore } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import type { RunId } from '../packages/contracts/src/index.ts';

function openDatabase() {
  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const database = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(database).apply();
  return database;
}

function cmdRecord([runId]: string[]): void {
  if (!runId) { console.error('Uso: forja provenance:record <run-id>'); process.exitCode = 1; return; }
  const database = openDatabase();
  try {
    const run = new SqliteRuntimeRunStore(database).get(runId as RunId);
    if (run === undefined) { console.error(`Run não encontrado: ${runId}.`); process.exitCode = 1; return; }
    const records = extractProvenance(run);
    const store = new SqliteProvenanceStore(database);
    for (const record of records) store.save(record);
    console.log(`${records.length} registro(s) de proveniência gravado(s) para ${runId} (${records.map((r) => r.file).join(', ') || '(nenhum arquivo alterado)'})`);
  } finally {
    database.close();
  }
}

function cmdBlame([file]: string[]): void {
  if (!file) { console.error('Uso: forja blame <file>'); process.exitCode = 1; return; }
  const database = openDatabase();
  try {
    const records = new SqliteProvenanceStore(database).list().filter((record) => record.file === file).sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
    if (records.length === 0) { console.log(`Nenhum registro de proveniência para ${file} ainda (granularidade de arquivo, não linha — rode forja provenance:record <run-id> primeiro).`); return; }
    for (const record of records) console.log(`${record.recordedAt}  ${record.agentName} (${record.agentId})  run:${record.runId}`);
  } finally {
    database.close();
  }
}

function cmdSbom(args: string[]): void {
  const json = args.includes('--json');
  const database = openDatabase();
  try {
    const records = new SqliteProvenanceStore(database).list();
    const byAgent = new Map<string, { agentId: string; agentName: string; files: Set<string> }>();
    for (const record of records) {
      const entry = byAgent.get(record.agentId) ?? { agentId: record.agentId, agentName: record.agentName, files: new Set<string>() };
      entry.files.add(record.file);
      byAgent.set(record.agentId, entry);
    }
    const report = [...byAgent.values()].map((entry) => ({ agentId: entry.agentId, agentName: entry.agentName, fileCount: entry.files.size, files: [...entry.files].sort() })).sort((left, right) => right.fileCount - left.fileCount);

    if (json) { console.log(JSON.stringify({ totalRecords: records.length, byAgent: report }, null, 2)); return; }
    if (report.length === 0) { console.log('Nenhum registro de proveniência ainda — rode forja provenance:record <run-id> primeiro.'); return; }
    console.log(`AI-SBOM — ${records.length} registro(s) de proveniência, ${report.length} agente(s)\n`);
    for (const entry of report) {
      console.log(`${entry.agentName} (${entry.agentId}) — ${entry.fileCount} arquivo(s)`);
      for (const file of entry.files) console.log(`  ${file}`);
    }
  } finally {
    database.close();
  }
}

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);
  switch (subcommand) {
    case 'record': return cmdRecord(rest);
    case 'blame': return cmdBlame(rest);
    case 'sbom': return cmdSbom(rest);
    default:
      console.error('Uso: forja provenance:record <run-id> | forja blame <file> | forja sbom [--json]');
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nprovenance: falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
