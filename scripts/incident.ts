#!/usr/bin/env node
/**
 * incident:record / :list / :similar (SPEC-041)
 *
 *   forja incident:record --title <t> [--description <d>]   grava um incidente no Engineering Graph
 *   forja incident:list                                      incidentes registrados, mais recentes primeiro
 *   forja incident:similar "<busca>"                          sugere incidentes parecidos por palavra-chave
 *
 * `GraphNode.type` já é vocabulário livre (`packages/graph`, já existente) — nenhum contrato novo,
 * só um adapter que grava/consulta o tipo `Incident` via `GraphLoop.upsertNode`/`addEvidence`, no
 * mesmo `SqliteGraphStore` compartilhado já usado por `adr:*`/`architecture:*`. Sem reindexação de
 * documentos aqui — incidentes não vêm de arquivo, são escritos diretamente.
 *
 * `incident:similar` é sugestão por palavra-chave — determinístico, nunca aplica nada sozinho
 * (AC-4). Matching local (D1 do plan): nós `Incident` desta versão não têm aresta nenhuma, então
 * `GraphLoop.contextRecords` (que casa contra arestas) não encontraria nada — o estilo de scoring é
 * o mesmo (sobreposição de termos), só a fonte é o nó, não a aresta.
 */

import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { GraphLoop } from '../packages/graph/src/index.ts';
import { SqliteGraphStore, SqliteMigrationRunner } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import { incidentRecords, rankIncidentsByQuery, titleOf } from '../lib/core/incident-search.ts';
import type { EntityId, ISO8601 } from '../packages/contracts/src/index.ts';

function flag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function withGraph<T>(fn: (graph: GraphLoop, store: SqliteGraphStore) => T): T {
  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const database = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(database).apply();
  const store = new SqliteGraphStore(database);
  const graph = new GraphLoop(store);
  try {
    return fn(graph, store);
  } finally {
    database.close();
  }
}

function cmdRecord(args: string[]): void {
  const title = flag(args, '--title');
  const description = flag(args, '--description');
  if (!title) { console.error('Uso: forja incident:record --title <t> [--description <d>]'); process.exitCode = 1; return; }

  withGraph((graph) => {
    const id = randomUUID() as EntityId;
    const now = new Date().toISOString() as ISO8601;
    graph.addEvidence({ id: `${id}:evidence` as EntityId, source: 'forja.cli', locator: 'incident:record', capturedAt: now, status: 'verified' });
    graph.upsertNode({ id, type: 'Incident', label: description === undefined ? title : `${title}\n${description}`, status: 'verified' });
    console.log(`Incidente registrado: ${id}`);
    console.log(`título: ${title}`);
  });
}

function cmdList(): void {
  withGraph((_graph, store) => {
    const records = incidentRecords(store);
    if (records.length === 0) { console.log('Nenhum incidente registrado ainda — rode forja incident:record --title <t> primeiro.'); return; }
    for (const record of records) console.log(`${record.createdAt}  ${record.id}  ${titleOf(record)}`);
  });
}

function cmdSimilar(args: string[]): void {
  const [query] = args;
  if (!query) { console.error('Uso: forja incident:similar "<busca>"'); process.exitCode = 1; return; }

  withGraph((_graph, store) => {
    const ranked = rankIncidentsByQuery(incidentRecords(store), query);
    if (ranked.length === 0) { console.log('Nenhum incidente parecido encontrado (busca por palavra-chave, sem entendimento semântico — AC-3).'); return; }
    for (const item of ranked) console.log(`[${item.relevance.toFixed(2)}] ${item.record.id}  ${titleOf(item.record)}`);
    console.log('\n(sugestão por palavra-chave, não uma alegação de causa igual — leitura, nunca aplicação automática, SPEC-041 AC-4)');
  });
}

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);
  switch (subcommand) {
    case 'record': return cmdRecord(rest);
    case 'list': return cmdList();
    case 'similar': return cmdSimilar(rest);
    default:
      console.error('Uso: forja incident:<record|list|similar> [args]');
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nincident: falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
