#!/usr/bin/env node
/**
 * adr:list / adr:show / adr:impact / adr:graph (SPEC-032)
 *
 *   forja adr:list                  lista ADRs com status
 *   forja adr:show <id>             mostra uma ADR: status, arquivo, constraints (se houver)
 *   forja adr:impact <id>           componentes/documentos alcançáveis a partir da ADR
 *   forja adr:graph [<id>]          subgrafo (JSON) de nós ADR/SPEC + vizinhança direta
 *
 * Reindexa o workspace pelo mesmo mecanismo de `graph:sync`/`drift:check` (checksum de fonte +
 * extração determinística) antes de consultar — mesma escolha de `drift:check`, para não exigir
 * que o operador lembre de rodar `code:sync` antes. `<id>` aceita `0020` ou `ADR-0020`
 * indiferentemente.
 *
 * Só leitura: nenhum destes comandos escreve em arquivo de projeto (SPEC-032 §5).
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { GitGraphDocumentSource, SpawnCommandRunner } from '../packages/adapter-git/src/index.ts';
import { GraphIndexer, GraphLoop } from '../packages/graph/src/index.ts';
import { SqliteGraphStore, SqliteMigrationRunner } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import type { GraphNode } from '../packages/contracts/src/index.ts';

function normalizeAdrId(raw: string): string {
  const digits = /(\d{4})/.exec(raw)?.[1];
  return digits === undefined ? raw : `ADR-${digits}`;
}

function adrFile(id: string): string | undefined {
  const digits = /(\d{4})/.exec(id)?.[1];
  if (digits === undefined) return undefined;
  const dir = path.join(process.env.FORJA_GRAPH_ROOT ?? process.cwd(), 'memory', '90-decisions');
  if (!fs.existsSync(dir)) return undefined;
  const match = fs.readdirSync(dir).find((name) => name.startsWith(`${digits}-`));
  return match === undefined ? undefined : path.join(dir, match);
}

function constraintsOf(file: string): readonly string[] {
  const content = fs.readFileSync(file, 'utf8');
  const section = /## Constraints\n([\s\S]*?)(?:\n## |\n?$)/.exec(content)?.[1];
  if (section === undefined) return [];
  return section.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('- '));
}

async function withGraph<T>(fn: (graph: GraphLoop, store: SqliteGraphStore) => Promise<T> | T): Promise<T> {
  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const database = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(database).apply();
  const store = new SqliteGraphStore(database);
  const graph = new GraphLoop(store);
  const source = new GitGraphDocumentSource(process.env.FORJA_GRAPH_ROOT ?? process.cwd(), new SpawnCommandRunner());
  await new GraphIndexer(graph).sync(source);
  try {
    return await fn(graph, store);
  } finally {
    database.close();
  }
}

async function cmdList(): Promise<void> {
  await withGraph((graph) => {
    const adrs = [...graph.query({ type: 'ADR' })].sort((left, right) => left.label.localeCompare(right.label));
    if (adrs.length === 0) { console.log('Nenhuma ADR encontrada no grafo.'); return; }
    console.log(`${adrs.length} ADR(s):\n`);
    for (const node of adrs) console.log(`${node.label}\t${node.documentStatus ?? '(status desconhecido)'}`);
  });
}

async function cmdShow([rawId]: string[]): Promise<void> {
  if (!rawId) { console.error('Uso: forja adr:show <id>'); process.exit(1); }
  const id = normalizeAdrId(rawId);
  await withGraph((graph) => {
    const node = graph.query({ type: 'ADR' }).find((item) => item.label === id);
    if (node === undefined) { console.error(`ADR não encontrada no grafo: ${id}`); process.exit(1); return; }
    const file = adrFile(id);
    console.log(`${node.label} — ${node.documentStatus ?? '(status desconhecido)'}`);
    console.log(`arquivo: ${file ?? '(não encontrado em memory/90-decisions)'}`);
    if (file !== undefined) {
      const constraints = constraintsOf(file);
      if (constraints.length > 0) {
        console.log('\nConstraints:');
        for (const line of constraints) console.log(`  ${line}`);
      }
    }
  });
}

async function cmdImpact([rawId, depthArg]: string[]): Promise<void> {
  if (!rawId) { console.error('Uso: forja adr:impact <id> [profundidade]'); process.exit(1); }
  const id = normalizeAdrId(rawId);
  const depth = Number.parseInt(depthArg ?? '', 10) || 2;
  await withGraph((graph) => {
    const node = graph.query({ type: 'ADR' }).find((item) => item.label === id);
    if (node === undefined) { console.error(`ADR não encontrada no grafo: ${id}`); process.exit(1); return; }
    const impact = graph.impact(node.id, depth, 'incoming'); // incoming: quem DEPENDS_ON/DERIVED_FROM/governed_by aponta PARA a ADR
    console.log(`Impacto de ${id} (profundidade ${depth}):\n`);
    console.log(`${impact.nodes.length - 1} nó(s) alcançável(is), ${impact.edges.length} aresta(s):\n`);
    for (const n of impact.nodes) if (n.id !== node.id) console.log(`  ${n.type}\t${n.label}`);
  });
}

async function cmdGraph([rawId]: string[]): Promise<void> {
  await withGraph((graph) => {
    if (rawId) {
      const id = normalizeAdrId(rawId);
      const node = [...graph.query({ type: 'ADR' }), ...graph.query({ type: 'SPEC' })].find((item) => item.label === id);
      if (node === undefined) { console.error(`Não encontrado no grafo: ${id}`); process.exit(1); return; }
      console.log(JSON.stringify(graph.impact(node.id, 1, 'both'), null, 2));
      return;
    }
    const nodes: readonly GraphNode[] = [...graph.query({ type: 'ADR' }), ...graph.query({ type: 'SPEC' })];
    console.log(JSON.stringify({ nodes }, null, 2));
  });
}

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);
  switch (subcommand) {
    case 'list': return cmdList();
    case 'show': return cmdShow(rest);
    case 'impact': return cmdImpact(rest);
    case 'graph': return cmdGraph(rest);
    default:
      console.error('Uso: forja adr:<list|show|impact|graph> [args]');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\nadr: falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
