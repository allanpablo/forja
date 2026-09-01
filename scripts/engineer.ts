#!/usr/bin/env node
/**
 * engineer (SPEC-035) — façade que compõe o que Sprints 1-2 já construíram.
 *
 *   forja engineer "<objetivo>" [--ref <ref>] [--json]
 *
 * Ordem de composição (specs/engineering-evidence-ledger/plan.md):
 *   ContextEngine.build() → GraphLoop.contextRecords() filtrado a ADR/SPEC (SPEC-032) →
 *   architecture:check não escopado (SPEC-033) → RiskEngine.assess() só com --ref (SPEC-034,
 *   D1: sem diff ainda, não há arquivo pra escopar) → fluxo recomendado, parseado da tabela
 *   "Etapa → papel → comando" de docs/fluxo.md (D2 — uma fonte de verdade, não copiada aqui).
 *
 * Nenhuma lógica de negócio nova (AC-4): cada seção é exatamente o que o subsistema já produziu.
 * Sem síntese de texto livre (AC-3) — não há chamada de LLM em nenhum ponto deste arquivo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { ContextEngine, GraphContextSource } from '../packages/context/src/index.ts';
import { checkConstitution, type ArchitectureCheckReport, type ArchitectureRule } from '../packages/engineering/architecture/src/index.ts';
import { assessRisk, type ChangeRiskAssessment } from '../packages/engineering/risk/src/index.ts';
import { GitGraphDocumentSource, SpawnCommandRunner } from '../packages/adapter-git/src/index.ts';
import { GraphIndexer, GraphLoop } from '../packages/graph/src/index.ts';
import { SqliteGraphStore, SqliteMigrationRunner } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import { buildRiskInput, changedFiles, graphRoot } from '../lib/core/risk-collect.ts';
import type { ContextPackage } from '../packages/contracts/src/index.ts';

const CONSTITUTION_PATH = '.context/architecture/constitution.json';
const FLUXO_PATH = 'docs/fluxo.md';

interface FluxoStep {
  readonly numero: string;
  readonly etapa: string;
  readonly papel: string;
  readonly comandos: string;
  readonly capacidade: string;
}

/** Parseia a tabela "Etapa → papel → comando → capacidade" de docs/fluxo.md — D2 do plan: uma fonte de verdade, não copiada aqui. */
function recommendedFlow(): readonly FluxoStep[] {
  const file = path.join(graphRoot(), FLUXO_PATH);
  if (!fs.existsSync(file)) return [];
  const rowPattern = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm;
  const steps: FluxoStep[] = [];
  for (const match of fs.readFileSync(file, 'utf8').matchAll(rowPattern)) {
    steps.push({ numero: match[1], etapa: match[2], papel: match[3], comandos: match[4], capacidade: match[5] });
  }
  return steps;
}

function relevantAdrs(graph: GraphLoop, objective: string): readonly { readonly content: string; readonly relevance: number }[] {
  return graph.contextRecords(objective)
    .filter((record) => /\bADR-\d{4}\b|\bSPEC-\d{3,4}\b/.test(record.content))
    .slice(0, 10)
    .map((record) => ({ content: record.content, relevance: record.relevance }));
}

interface EngineerReport {
  readonly objective: string;
  readonly ref?: string;
  readonly context: { readonly references: number; readonly content: readonly string[] };
  readonly relevantAdrs: readonly { readonly content: string; readonly relevance: number }[];
  readonly architectureCheck: ArchitectureCheckReport | { readonly note: string };
  readonly risk?: ChangeRiskAssessment;
  readonly recommendedFlow: readonly FluxoStep[];
}

async function buildReport(objective: string, ref: string | undefined): Promise<EngineerReport> {
  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const database = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(database).apply();
  try {
    const store = new SqliteGraphStore(database);
    const graph = new GraphLoop(store);
    await new GraphIndexer(graph).sync(new GitGraphDocumentSource(graphRoot(), new SpawnCommandRunner()));

    const context: ContextPackage = await new ContextEngine({
      graph: new GraphContextSource({ searchContext: (o) => graph.contextRecords(o) }),
      // maxItems: 10 — sem isto, um objetivo genérico contra um repositório grande devolve
      // centenas/milhares de candidatos (achado real: "compilar a architecture constitution deste
      // repositório" contra este próprio repositório trouxe 1013). `forja engineer` é pra orientar
      // o início do trabalho, não substituir `context:smart`/`code:query` — os 10 mais relevantes
      // (já ordenados por `ContextEngine.build`) bastam pro humano decidir se e como prosseguir
      // (AC-3/métrica §8); a lista completa continua disponível via os comandos focados.
    }).build({ objective, budget: { inputTokens: 20000, outputTokens: 0, totalTokens: 20000, usedTokens: 0 }, includeContent: true, requireEvidence: false, maxItems: 10 });

    const constitutionFile = path.join(graphRoot(), CONSTITUTION_PATH);
    let architectureCheck: ArchitectureCheckReport | { readonly note: string };
    if (fs.existsSync(constitutionFile)) {
      const { rules } = JSON.parse(fs.readFileSync(constitutionFile, 'utf8')) as { rules: readonly ArchitectureRule[] };
      const edges = store.listEdges().flatMap((edge) => {
        if (edge.type !== 'DEPENDS_ON') return [];
        const fromNode = store.getNode(edge.from);
        const toNode = store.getNode(edge.to);
        return fromNode === undefined || toNode === undefined ? [] : [{ fromPath: fromNode.label, targetLabel: toNode.label }];
      });
      architectureCheck = checkConstitution(rules, edges);
    } else {
      architectureCheck = { note: 'Constitution não compilada ainda — rode `forja architecture:compile`.' };
    }

    let risk: ChangeRiskAssessment | undefined;
    if (ref !== undefined) {
      const paths = changedFiles(ref);
      if (paths.length > 0) {
        const input = await buildRiskInput(paths, database);
        risk = assessRisk(input, { id: randomUUID(), changeId: ref, now: new Date().toISOString() });
      }
    }

    return {
      objective,
      ...(ref === undefined ? {} : { ref }),
      context: { references: context.references.length, content: context.content },
      relevantAdrs: relevantAdrs(graph, objective),
      architectureCheck,
      ...(risk === undefined ? {} : { risk }),
      recommendedFlow: recommendedFlow(),
    };
  } finally {
    database.close();
  }
}

function printText(report: EngineerReport): void {
  console.log(`objetivo: ${report.objective}`);
  if (report.ref !== undefined) console.log(`ref: ${report.ref}`);
  console.log('');

  console.log(`CONTEXTO (${report.context.references} referência(s) do grafo)`);
  if (report.context.content.length === 0) console.log('  (nenhuma referência encontrada — objetivo novo, sem histórico ainda)');
  for (const line of report.context.content) console.log(`  ${line}`);
  console.log('');

  console.log(`ADRs/SPECs RELEVANTES (${report.relevantAdrs.length})`);
  if (report.relevantAdrs.length === 0) console.log('  (nenhuma)');
  for (const adr of report.relevantAdrs) console.log(`  [${adr.relevance.toFixed(2)}] ${adr.content}`);
  console.log('');

  console.log('ARCHITECTURE CHECK');
  if ('note' in report.architectureCheck) {
    console.log(`  ${report.architectureCheck.note}`);
  } else {
    console.log(`  ${report.architectureCheck.compliant} regra(s) active em conformidade, ${report.architectureCheck.violations.length} violação(ões)`);
    for (const violation of report.architectureCheck.violations) console.log(`  ${violation.severity.toUpperCase()} ${violation.file} viola ${violation.ruleId}`);
  }
  console.log('');

  console.log('RISCO');
  if (report.risk === undefined) {
    console.log('  sem --ref — nenhuma mudança ainda para avaliar (rode com --ref <commit> quando houver um).');
  } else {
    console.log(`  score ${report.risk.score}/100 → ${report.risk.autonomyBand} (confidence ${(report.risk.confidence * 100).toFixed(0)}%)`);
  }
  console.log('');

  console.log('FLUXO RECOMENDADO (docs/fluxo.md)');
  for (const step of report.recommendedFlow) console.log(`  ${step.numero}. ${step.etapa} (${step.papel}) — ${step.comandos}`);
}

async function cmdEngineer(args: string[]): Promise<void> {
  const json = args.includes('--json');
  const refIndex = args.indexOf('--ref');
  const ref = refIndex === -1 ? undefined : args[refIndex + 1];
  const objective = args.filter((arg, index) => arg !== '--json' && (refIndex === -1 || (index !== refIndex && index !== refIndex + 1)))[0];
  if (!objective) { console.error('Uso: forja engineer "<objetivo>" [--ref <ref>] [--json]'); process.exitCode = 1; return; }

  const report = await buildReport(objective, ref);
  if (json) console.log(JSON.stringify(report, null, 2));
  else printText(report);
}

async function main(): Promise<void> {
  await cmdEngineer(process.argv.slice(2));
}

main().catch((error) => {
  console.error(`\nengineer: falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
