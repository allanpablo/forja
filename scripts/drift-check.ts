#!/usr/bin/env node
/**
 * drift:check — "verified" continua verdade? (SPEC-030)
 *
 *   forja drift:check                  reindexa o workspace e reporta drift estrutural
 *   forja drift:check --domain <d>     restringe aos documentos cujo path passa por /<d>/
 *   forja drift:check --all            roda em lote sobre cada projeto do workspace (SPEC-030 §3,
 *                                      ADR-0084); cada projeto num grafo isolado e persistente
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
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { checkDrift, type DriftReport } from '../lib/drift-sentinel.ts';
import { GitGraphDocumentSource, SpawnCommandRunner } from '../packages/adapter-git/src/index.ts';
import { GraphLoop } from '../packages/graph/src/index.ts';
import { SqliteGraphStore, SqliteMigrationRunner } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath, getProjectsDir, listProjects } from '../lib/workspace.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

/**
 * `--all` (SPEC-030 §3, ADR-0084): roda `drift:check` uma vez por projeto do workspace, cada um
 * contra o próprio dir (`FORJA_GRAPH_ROOT`) e um grafo isolado e **persistente**
 * (`<projeto>/.context/drift-graph.db`) — a persistência é o que dá o "antes" para a próxima
 * rodada detectar. Primeira rodada num projeto novo semeia; a partir da segunda, compara.
 */
function runAll(): number {
  const projectsDir = getProjectsDir();
  const projects = listProjects();
  console.log('\nForja drift:check --all — o verified continua verdade, projeto a projeto?\n');
  if (projects.length === 0) {
    console.log(`Nenhum projeto em ${projectsDir}. Gere um com \`forja project:new <nome>\`.`);
    return 0;
  }

  let drifted = 0;
  let failed = 0;
  for (const name of projects) {
    const projDir = path.join(projectsDir, name);
    const dbDir = path.join(projDir, '.context');
    fs.mkdirSync(dbDir, { recursive: true });
    const result = spawnSync(process.execPath, [path.join(__dirname, 'drift-check.ts')], {
      cwd: projDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        FORJA_GRAPH_ROOT: projDir,
        FORJA_RUNTIME_DB: path.join(dbDir, 'drift-graph.db'),
      },
    });
    const code = result.status ?? 1;
    const count = /(\d+) com drift detectado/.exec(result.stdout ?? '')?.[1] ?? '?';
    if (code === 0) {
      console.log(`✓ ${name.padEnd(28)} sem drift (${count === '?' ? 'semeado' : `${count} doc(s)`})`);
    } else if (code === 1) {
      drifted += 1;
      console.log(`✗ ${name.padEnd(28)} ${count} documento(s) com relação verified não reproduzível`);
    } else {
      failed += 1;
      console.log(`! ${name.padEnd(28)} drift:check não rodou (exit ${code}) — ${(result.stderr || '').trim().split('\n')[0]}`);
    }
  }

  console.log(`\n${projects.length} projeto(s): ${drifted} com drift, ${failed} sem rodar.`);
  console.log('É a rodada 2+ que detecta — a 1ª só semeia o grafo de cada projeto.');
  return drifted > 0 || failed > 0 ? 1 : 0;
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
  if (process.argv.includes('--all')) {
    process.exit(runAll());
  }

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
