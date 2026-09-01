#!/usr/bin/env node
/**
 * engineer (SPEC-035, estendida por SPEC-042) — façade que compõe o que os Sprints 1-9 já
 * construíram.
 *
 *   forja engineer "<objetivo>" [--ref <ref>] [--role <role>] [--json]
 *
 * Ordem de composição (specs/engineering-evidence-ledger/plan.md, +SPEC-042):
 *   ContextEngine.build() → GraphLoop.contextRecords() filtrado a ADR/SPEC (SPEC-032) →
 *   architecture:check não escopado (SPEC-033) → RiskEngine.assess() só com --ref (SPEC-034,
 *   D1: sem diff ainda, não há arquivo pra escopar) → agentes recomendados só com --role
 *   (recommendAgent, SPEC-037) → incidentes parecidos (rankIncidentsByQuery, SPEC-041) → fluxo
 *   recomendado, parseado da tabela "Etapa → papel → comando" de docs/fluxo.md (D2 — uma fonte de
 *   verdade, não copiada aqui).
 *
 * Nenhuma lógica de negócio nova (AC-4/AC-3 de SPEC-035, reafirmado em AC-3 de SPEC-042): cada
 * seção é exatamente o que o subsistema já produziu. Sem síntese de texto livre (AC-3) — não há
 * chamada de LLM em nenhum ponto deste arquivo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { ContextEngine, GraphContextSource } from '../packages/context/src/index.ts';
import { checkConstitution, type ArchitectureCheckReport, type ArchitectureRule } from '../packages/engineering/architecture/src/index.ts';
import { assessRisk, type ChangeRiskAssessment } from '../packages/engineering/risk/src/index.ts';
import { recommendAgent, type AgentRecommendation } from '../packages/engineering/identity/src/index.ts';
import { GitGraphDocumentSource, SpawnCommandRunner } from '../packages/adapter-git/src/index.ts';
import { GraphIndexer, GraphLoop } from '../packages/graph/src/index.ts';
import { SqliteAgentProfileStore, SqliteGraphStore, SqliteMigrationRunner } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import { buildRiskInput, changedFiles, graphRoot } from '../lib/core/risk-collect.ts';
import { incidentRecords, rankIncidentsByQuery, titleOf } from '../lib/core/incident-search.ts';
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
  readonly role?: string;
  readonly context: { readonly references: number; readonly content: readonly string[] };
  readonly relevantAdrs: readonly { readonly content: string; readonly relevance: number }[];
  readonly architectureCheck: ArchitectureCheckReport | { readonly note: string };
  readonly risk?: ChangeRiskAssessment;
  readonly recommendedAgents?: readonly AgentRecommendation[];
  readonly similarIncidents: readonly { readonly id: string; readonly title: string; readonly relevance: number }[];
  readonly recommendedFlow: readonly FluxoStep[];
}

async function buildReport(objective: string, ref: string | undefined, role: string | undefined): Promise<EngineerReport> {
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

    // Só com --role: nunca inventa um papel que o usuário não informou (AC-1 de SPEC-042).
    const recommendedAgents = role === undefined ? undefined : recommendAgent(new SqliteAgentProfileStore(database).list(), { role });

    // Sempre presente (mesmo vazio) — incidentes parecidos com o objetivo, mesma busca por
    // palavra-chave de `incident:similar` (AC-2 de SPEC-042).
    const similarIncidents = rankIncidentsByQuery(incidentRecords(store), objective)
      .slice(0, 5)
      .map((item) => ({ id: item.record.id, title: titleOf(item.record), relevance: item.relevance }));

    return {
      objective,
      ...(ref === undefined ? {} : { ref }),
      ...(role === undefined ? {} : { role }),
      context: { references: context.references.length, content: context.content },
      relevantAdrs: relevantAdrs(graph, objective),
      architectureCheck,
      ...(risk === undefined ? {} : { risk }),
      ...(recommendedAgents === undefined ? {} : { recommendedAgents }),
      similarIncidents,
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

  if (report.recommendedAgents !== undefined) {
    console.log(`AGENTES RECOMENDADOS (role: ${report.role})`);
    if (report.recommendedAgents.length === 0) console.log('  (nenhum agente registrado — rode forja agent:register primeiro)');
    for (const item of report.recommendedAgents) console.log(`  ${item.agentId}  score:${item.score}  ${item.reasons.join(', ')}`);
    console.log('');
  }

  console.log(`INCIDENTES PARECIDOS (${report.similarIncidents.length})`);
  if (report.similarIncidents.length === 0) console.log('  (nenhum)');
  for (const item of report.similarIncidents) console.log(`  [${item.relevance.toFixed(2)}] ${item.id}  ${item.title}`);
  console.log('');

  console.log('FLUXO RECOMENDADO (docs/fluxo.md)');
  for (const step of report.recommendedFlow) console.log(`  ${step.numero}. ${step.etapa} (${step.papel}) — ${step.comandos}`);
}

async function cmdEngineer(args: string[]): Promise<void> {
  const json = args.includes('--json');
  const refIndex = args.indexOf('--ref');
  const roleIndex = args.indexOf('--role');
  const ref = refIndex === -1 ? undefined : args[refIndex + 1];
  const role = roleIndex === -1 ? undefined : args[roleIndex + 1];
  // Cada índice só entra em `consumed` quando a flag correspondente foi de fato encontrada — achado
  // real da primeira versão deste arquivo: computar `refIndex + 1` incondicionalmente, mesmo com
  // `refIndex === -1` (valendo 0), engolia o próprio objetivo quando nenhuma flag era passada.
  const consumed = new Set<number>();
  if (refIndex !== -1) { consumed.add(refIndex); consumed.add(refIndex + 1); }
  if (roleIndex !== -1) { consumed.add(roleIndex); consumed.add(roleIndex + 1); }
  const objective = args.find((arg, index) => arg !== '--json' && !consumed.has(index));
  if (!objective) { console.error('Uso: forja engineer "<objetivo>" [--ref <ref>] [--role <role>] [--json]'); process.exitCode = 1; return; }

  const report = await buildReport(objective, ref, role);
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
