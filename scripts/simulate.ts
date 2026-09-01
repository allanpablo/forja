#!/usr/bin/env node
/**
 * simulate (SPEC-038) — Predictive Change Simulation.
 *
 *   forja simulate <ref> [--command "npm test"] [--json]
 *
 * Composição pura de engines já existentes (gap analysis §3 do doc de arquitetura): `SandboxEngine`
 * + `GitWorktreeBackend` (isolamento real, packages/sandbox+adapter-git) para checar out `<ref>`
 * num worktree isolado e rodar o comando de teste; `checkConstitution` (SPEC-033) + `assessRisk`
 * (SPEC-034, via `lib/core/risk-collect.ts`) para avaliar o estado resultante. Nada disso é lógica
 * nova — só orquestração.
 *
 * Ciclo do sandbox (D1 do plan): create→prepare→execute→reject→destroy. `promote()` **nunca** é
 * chamado neste arquivo — a única escrita na árvore real é a remoção do próprio worktree (AC-3).
 *
 * Grafo/SQLite da simulação são temporários (`mkdtemp`, D3 do plan) — nunca `getWorkspaceDbPath()`,
 * pra não contaminar o Engineering Graph persistente com o estado de um ref que pode nunca ser
 * integrado (AC-2).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { checkConstitution, type ArchitectureCheckReport, type ArchitectureRule } from '../packages/engineering/architecture/src/index.ts';
import { assessRisk, type ChangeRiskAssessment } from '../packages/engineering/risk/src/index.ts';
import { SandboxEngine, InMemorySandboxStore } from '../packages/sandbox/src/index.ts';
import { GitWorktreeBackend, SpawnCommandRunner } from '../packages/adapter-git/src/index.ts';
import { GitGraphDocumentSource } from '../packages/adapter-git/src/index.ts';
import { GraphIndexer, GraphLoop } from '../packages/graph/src/index.ts';
import { SqliteGraphStore, SqliteMigrationRunner } from '../packages/adapter-sqlite/src/index.ts';
import { buildRiskInput, changedFiles } from '../lib/core/risk-collect.ts';
import type { RunId } from '../packages/contracts/src/index.ts';

const CONSTITUTION_PATH = '.context/architecture/constitution.json';

function repoRoot(): string {
  return process.env.FORJA_GRAPH_ROOT ?? process.cwd();
}

interface SimulationReport {
  readonly ref: string;
  readonly changedFiles: readonly string[];
  readonly testCommand: string;
  readonly testResult: { readonly exitCode: number; readonly durationMs: number; readonly passed: boolean };
  readonly architectureCheck: ArchitectureCheckReport | { readonly note: string };
  readonly risk: ChangeRiskAssessment;
  readonly recommendation: 'promote' | 'review' | 'discard';
}

/** Roda `buildRiskInput`/`checkConstitution` contra `worktreeRoot`, isolado do workspace real (D3). */
async function assessWorktree(worktreeRoot: string, paths: readonly string[]): Promise<{ architectureCheck: ArchitectureCheckReport | { note: string }; risk: ChangeRiskAssessment }> {
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-simulate-db-'));
  const database = new Database(path.join(tempBase, 'simulate.db'));
  new SqliteMigrationRunner(database).apply();
  const previousGraphRoot = process.env.FORJA_GRAPH_ROOT;
  try {
    process.env.FORJA_GRAPH_ROOT = worktreeRoot;
    const store = new SqliteGraphStore(database);
    const graph = new GraphLoop(store);
    await new GraphIndexer(graph).sync(new GitGraphDocumentSource(worktreeRoot, new SpawnCommandRunner()));

    let architectureCheck: ArchitectureCheckReport | { note: string };
    const constitutionFile = path.join(worktreeRoot, CONSTITUTION_PATH);
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
      architectureCheck = { note: 'Constitution não compilada no ref simulado.' };
    }

    const riskInput = await buildRiskInput(paths, database);
    const risk = assessRisk(riskInput, { id: randomUUID(), changeId: 'simulation', now: new Date().toISOString() });

    return { architectureCheck, risk };
  } finally {
    process.env.FORJA_GRAPH_ROOT = previousGraphRoot;
    database.close();
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
}

function recommendationFor(testPassed: boolean, architectureCheck: ArchitectureCheckReport | { note: string }, risk: ChangeRiskAssessment): 'promote' | 'review' | 'discard' {
  if (!testPassed) return 'discard';
  const hasViolation = 'violations' in architectureCheck && architectureCheck.violations.length > 0;
  if (hasViolation) return 'review';
  if (risk.autonomyBand === 'supervised' || risk.autonomyBand === 'human_in_the_loop') return 'review';
  return 'promote';
}

async function cmdSimulate(args: string[]): Promise<void> {
  const json = args.includes('--json');
  const commandIndex = args.indexOf('--command');
  const testCommand = commandIndex === -1 ? 'npm test' : args[commandIndex + 1];
  const ref = args.filter((arg, index) => arg !== '--json' && (commandIndex === -1 || (index !== commandIndex && index !== commandIndex + 1)))[0];
  if (!ref) { console.error('Uso: forja simulate <ref> [--command "npm test"] [--json]'); process.exitCode = 1; return; }

  const paths = changedFiles(ref);
  const runner = new SpawnCommandRunner();
  const patchApplier = { apply: () => { throw new Error('simulate nunca promove — patchApplier.apply não deveria ser chamado'); }, revert: () => { /* nunca chamado — reject() não usa revert */ } };
  const sandbox = new SandboxEngine(new InMemorySandboxStore(), new GitWorktreeBackend(runner, { repositoryRoot: repoRoot(), sourceRef: ref, patchApplier }));

  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-simulate-'));
  const worktreeRoot = path.join(tempBase, 'worktree');
  const runId = randomUUID() as RunId;
  const session = await sandbox.create({ runId, root: worktreeRoot });
  try {
    await sandbox.prepare(session.id);
    const [executable, ...cmdArgs] = testCommand.split(' ');
    const execution = await sandbox.execute(session.id, { executable, args: cmdArgs, cwd: worktreeRoot });
    const testResult = { exitCode: execution.exitCode, durationMs: execution.durationMs, passed: execution.exitCode === 0 };

    const { architectureCheck, risk } = await assessWorktree(worktreeRoot, paths);
    const recommendation = recommendationFor(testResult.passed, architectureCheck, risk);

    const report: SimulationReport = { ref, changedFiles: paths, testCommand, testResult, architectureCheck, risk, recommendation };
    if (json) console.log(JSON.stringify(report, null, 2));
    else printText(report);
  } finally {
    // best-effort — reject() pode já ter deixado a sessão num estado terminal se execute() lançou,
    // e destroy() pode achar o worktree já removido pelo reject(); nenhum dos dois é fatal aqui. O
    // erro é logado (não silenciado) porque uma falha real de cleanup deixaria um worktree/branch
    // órfão na árvore real — algo que vale saber, mesmo sem abortar a simulação por causa disso.
    await sandbox.reject(session.id).catch((error) => { console.error(`simulate: aviso — reject do sandbox falhou: ${error instanceof Error ? error.message : String(error)}`); });
    await sandbox.destroy(session.id).catch((error) => { console.error(`simulate: aviso — destroy do sandbox falhou: ${error instanceof Error ? error.message : String(error)}`); });
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
}

function printText(report: SimulationReport): void {
  console.log(`simulate ${report.ref}`);
  console.log(`${report.changedFiles.length} arquivo(s) alterado(s)`);
  console.log('');
  console.log(`teste (${report.testCommand}): ${report.testResult.passed ? 'PASSOU' : 'FALHOU'} (exit ${report.testResult.exitCode}, ${report.testResult.durationMs}ms)`);
  console.log('');
  console.log('ARCHITECTURE CHECK');
  if ('note' in report.architectureCheck) console.log(`  ${report.architectureCheck.note}`);
  else {
    console.log(`  ${report.architectureCheck.compliant} regra(s) active em conformidade, ${report.architectureCheck.violations.length} violação(ões)`);
    for (const violation of report.architectureCheck.violations) console.log(`  ${violation.severity.toUpperCase()} ${violation.file} viola ${violation.ruleId}`);
  }
  console.log('');
  console.log(`RISCO: score ${report.risk.score}/100 → ${report.risk.autonomyBand} (confidence ${(report.risk.confidence * 100).toFixed(0)}%)`);
  console.log('');
  console.log(`RECOMENDAÇÃO: ${report.recommendation.toUpperCase()} — informação, não decisão automática (nenhuma mudança foi aplicada à árvore real)`);
}

async function main(): Promise<void> {
  await cmdSimulate(process.argv.slice(2));
}

main().catch((error) => {
  console.error(`\nsimulate: falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
