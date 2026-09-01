#!/usr/bin/env node
/**
 * drift:check — "verified" continua verdade? (SPEC-030)
 *
 *   forja drift:check                  reindexa o workspace e reporta drift estrutural
 *   forja drift:check --domain <d>     restringe aos documentos cujo path passa por /<d>/
 *
 * Reindexa via o mesmo mecanismo de `graph:sync` (checksum de fonte + extração determinística) e,
 * para cada documento cujo conteúdo mudou, compara as relações `verified` que ele produzia antes
 * com as que produz agora. Uma relação que sumiu vira `stale` (validTo carimbado, sem inventar
 * status novo — GraphLoop já suporta validade temporal). Determinístico, sem LLM, sem rede: é
 * extração + diff, igual ao extrator que já indexa o grafo (AC-4).
 *
 * Não corrige nada sozinho — só sinaliza. Decidir se o código ou a ADR/spec está desatualizada é
 * julgamento humano ou de agente (SPEC-030 §5, fora de escopo deste comando).
 */

import fs from 'node:fs';
import Database from 'better-sqlite3';
import { checkDrift, type DriftReport } from '../lib/drift-sentinel.ts';
import { GitGraphDocumentSource, SpawnCommandRunner } from '../packages/adapter-git/src/index.ts';
import { GraphLoop } from '../packages/graph/src/index.ts';
import { SqliteGraphStore, SqliteMigrationRunner } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

function printReport(report: DriftReport, domain: string | null): void {
  console.log(`\nForja drift:check${domain ? ` --domain ${domain}` : ''} — o verified continua verdade?\n`);
  console.log(`${report.documents} documento(s) verificado(s), ${report.unchanged} sem mudança, ${report.drifted} com drift detectado.\n`);

  if (report.details.length === 0) {
    console.log(report.changed > 0
      ? `✓ ${report.changed} documento(s) mudaram, mas toda relação verified anterior continua reproduzível.`
      : '✓ nenhum documento mudou desde a última indexação.');
    return;
  }

  for (const drift of report.details) {
    console.log(`✗ ${drift.sourceKey} — ${drift.stale.length} relação(ões) ficaram stale:`);
    for (const relation of drift.stale) console.log(`    ${relation.type}: ${relation.from} → ${relation.to} — verified antes, não reproduzida pela extração atual`);
  }
  console.log(`\n${report.drifted} documento(s) com drift. As arestas acima ganharam validTo — somem de query()/path()/impact() por padrão, mas continuam auditáveis com o parâmetro --at de quem consultar o grafo.`);
  console.log('drift:check só sinaliza — corrigir a ADR/spec desatualizada ou reverter o código é decisão humana/de agente, não deste comando.');
}

async function main(): Promise<void> {
  const domain = arg('--domain');
  const graphRoot = process.env.FORJA_GRAPH_ROOT ?? process.cwd();

  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const database = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(database).apply();
  const store = new SqliteGraphStore(database);
  const graph = new GraphLoop(store);
  const source = new GitGraphDocumentSource(graphRoot, new SpawnCommandRunner());

  const report = await checkDrift(graph, store, source, domain === null ? {} : { domain });
  database.close();

  printReport(report, domain);

  if (report.drifted > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`\ndrift:check falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
