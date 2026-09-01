#!/usr/bin/env node
/**
 * risk:assess / risk:explain (SPEC-034)
 *
 *   forja risk:assess [ref]      score de risco 0-100 sobre o diff de <ref> (default: working tree vs HEAD)
 *   forja risk:explain <id>      reexibe um assessment já calculado, com todos os fatores
 *
 * `packages/engineering/risk` faz o cálculo puro (7 fatores, pesos configuráveis, D1-D4 do plan);
 * `lib/core/risk-collect.ts` coleta os números reais (grafo, constitution, histórico) — reaproveitado
 * também por `scripts/engineer.ts` (SPEC-035), daí viver em `lib/core` e não aqui. Este script só
 * cuida do ciclo de vida do assessment em si: diff via git, persistência efêmera
 * (`.context/risk/<id>.json`, mesma categoria de `.context/forja-runs.jsonl` — fora do git, D2 do
 * plan de SPEC-034), e a CLI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { assessRisk, explainAssessment, type ChangeRiskAssessment } from '../packages/engineering/risk/src/index.ts';
import { SqliteMigrationRunner } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import { buildRiskInput, changedFiles, graphRoot } from '../lib/core/risk-collect.ts';

const RISK_DIR = '.context/risk';

function assessmentPath(id: string): string {
  return path.join(graphRoot(), RISK_DIR, `${id}.json`);
}

function saveAssessment(assessment: ChangeRiskAssessment): void {
  fs.mkdirSync(path.join(graphRoot(), RISK_DIR), { recursive: true });
  fs.writeFileSync(assessmentPath(assessment.id), `${JSON.stringify(assessment, null, 2)}\n`);
}

async function cmdAssess([ref]: string[]): Promise<void> {
  const paths = changedFiles(ref);
  if (paths.length === 0) {
    console.log('Nenhum arquivo alterado — nada para avaliar (compare contra HEAD, ou passe um ref de commit).');
    return;
  }

  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const database = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(database).apply();
  let input;
  try {
    input = await buildRiskInput(paths, database);
  } finally {
    database.close();
  }

  const id = randomUUID();
  const assessment = assessRisk(input, { id, changeId: ref ?? 'working-tree', now: new Date().toISOString() });
  saveAssessment(assessment);
  console.log(explainAssessment(assessment));
  console.log(`\n${paths.length} arquivo(s) avaliado(s). Assessment salvo — forja risk:explain ${id}`);
}

function cmdExplain([id]: string[]): void {
  if (!id) { console.error('Uso: forja risk:explain <assessment-id>'); process.exitCode = 1; return; }
  const file = assessmentPath(id);
  if (!fs.existsSync(file)) { console.error(`Assessment não encontrado: ${id}. Rode forja risk:assess primeiro.`); process.exitCode = 1; return; }
  const assessment = JSON.parse(fs.readFileSync(file, 'utf8')) as ChangeRiskAssessment;
  console.log(explainAssessment(assessment));
}

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);
  switch (subcommand) {
    case 'assess': return cmdAssess(rest);
    case 'explain': return cmdExplain(rest);
    default:
      console.error('Uso: forja risk:<assess|explain> [args]');
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nrisk: falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
