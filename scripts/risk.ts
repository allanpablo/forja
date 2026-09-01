#!/usr/bin/env node
/**
 * risk:assess / risk:explain (SPEC-034)
 *
 *   forja risk:assess [ref]      score de risco 0-100 sobre o diff de <ref> (default: working tree vs HEAD)
 *   forja risk:explain <id>      reexibe um assessment já calculado, com todos os fatores
 *
 * `packages/engineering/risk` faz o cálculo puro (7 fatores, pesos configuráveis, D1-D4 do plan);
 * este script é o adapter que coleta os números reais: diff via git, blast radius via
 * `GraphLoop.impact()` (mesmo grafo real de `adr:*`/`architecture:*`), violações de arquitetura via
 * `checkConstitution` (SPEC-033) sobre `constitution.json`, histórico via `SqliteObservationStore`
 * (já existente, sem tabela nova). Assessments são efêmeros: `.context/risk/<id>.json`, mesma
 * categoria de `.context/forja-runs.jsonl` — regenerável, fora do git (D2 do plan).
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { assessRisk, explainAssessment, type ChangeRiskAssessment, type RiskInput } from '../packages/engineering/risk/src/index.ts';
import { checkConstitution, type ArchitectureRule, type DependencyEdge } from '../packages/engineering/architecture/src/index.ts';
import { GitGraphDocumentSource, SpawnCommandRunner } from '../packages/adapter-git/src/index.ts';
import { GraphIndexer, GraphLoop } from '../packages/graph/src/index.ts';
import { SqliteGraphStore, SqliteMigrationRunner, SqliteObservationStore } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import type { EntityId } from '../packages/contracts/src/index.ts';

const RISK_DIR = '.context/risk';
const CONSTITUTION_PATH = '.context/architecture/constitution.json';

function graphRoot(): string {
  return process.env.FORJA_GRAPH_ROOT ?? process.cwd();
}

function changedFiles(ref?: string): readonly string[] {
  const args = ref !== undefined ? ['diff', '--name-only', `${ref}^`, ref] : ['diff', '--name-only', 'HEAD'];
  try {
    return execFileSync('git', args, { cwd: graphRoot(), encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

const SENSITIVE_PATTERNS: readonly { readonly category: string; readonly pattern: RegExp }[] = [
  { category: 'secrets', pattern: /secret|credential|\.env\b/i },
  { category: 'database', pattern: /adapter-sqlite|migration|database/i },
  { category: 'deployment', pattern: /deploy|\.github\/workflows|Dockerfile/i },
];

function inferSensitiveCategories(paths: readonly string[]): { categories: readonly string[]; evidenceIds: readonly string[] } {
  const categories = new Set<string>();
  const evidenceIds = new Set<string>();
  for (const file of paths) {
    for (const { category, pattern } of SENSITIVE_PATTERNS) {
      if (pattern.test(file)) { categories.add(category); evidenceIds.add(file); }
    }
  }
  return { categories: [...categories], evidenceIds: [...evidenceIds] };
}

function serviceUnit(file: string): string | undefined {
  const match = /^(packages|apps)\/([^/]+)\//.exec(file);
  return match ? `${match[1]}/${match[2]}` : undefined;
}

function totalServiceUnits(): number {
  let count = 0;
  for (const root of ['packages', 'apps']) {
    const dir = path.join(graphRoot(), root);
    if (fs.existsSync(dir)) count += fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
  }
  return count;
}

function testedRatio(paths: readonly string[]): { ratio: number | undefined; evidenceIds: readonly string[] } {
  if (paths.length === 0) return { ratio: undefined, evidenceIds: [] };
  const evidenceIds: string[] = [];
  let tested = 0;
  for (const file of paths) {
    if (testCandidateNames(file).some((name) => {
      const candidate = path.join(graphRoot(), 'test', `${name}.test.js`);
      const found = fs.existsSync(candidate);
      if (found) evidenceIds.push(path.relative(graphRoot(), candidate));
      return found;
    })) tested += 1;
  }
  return { ratio: tested / paths.length, evidenceIds };
}

/**
 * Nomes candidatos de teste para `file`. `index.ts` é o basename mais comum do repositório (todo
 * pacote tem um) — usar só o basename faria `packages/a/src/index.ts` e `packages/b/src/index.ts`
 * baterem no mesmo `test/index.test.js` por coincidência, inflando falsamente `test_confidence`.
 * Quando o basename é `index`, o nome do pacote/app (`packages/<nome>/...`) é um candidato melhor.
 */
function testCandidateNames(file: string): readonly string[] {
  const base = path.basename(file).replace(/\.(ts|js|tsx|jsx)$/, '');
  if (base !== 'index') return [base];
  const packageMatch = /^(?:packages|apps)\/([^/]+)\//.exec(file);
  return packageMatch ? [packageMatch[1]] : [base];
}

function dependencyEdgesFrom(store: SqliteGraphStore): readonly DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  for (const edge of store.listEdges()) {
    if (edge.type !== 'DEPENDS_ON') continue;
    const fromNode = store.getNode(edge.from);
    const toNode = store.getNode(edge.to);
    if (fromNode === undefined || toNode === undefined) continue;
    edges.push({ fromPath: fromNode.label, targetLabel: toNode.label });
  }
  return edges;
}

function architectureViolationsFor(paths: readonly string[], store: SqliteGraphStore): { count: number; evidenceIds: readonly string[] } {
  const constitutionFile = path.join(graphRoot(), CONSTITUTION_PATH);
  if (!fs.existsSync(constitutionFile)) return { count: 0, evidenceIds: [] };
  const { rules } = JSON.parse(fs.readFileSync(constitutionFile, 'utf8')) as { rules: readonly ArchitectureRule[] };
  const report = checkConstitution(rules, dependencyEdgesFrom(store));
  const scoped = report.violations.filter((violation) => paths.includes(violation.file));
  return { count: scoped.length, evidenceIds: scoped.map((violation) => `${violation.ruleId}:${violation.file}`) };
}

async function buildInput(paths: readonly string[]): Promise<RiskInput> {
  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const database = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(database).apply();
  const store = new SqliteGraphStore(database);
  const graph = new GraphLoop(store);
  try {
    await new GraphIndexer(graph).sync(new GitGraphDocumentSource(graphRoot(), new SpawnCommandRunner()));

    const allNodes = store.listNodes();
    // Todos os nós cujo label bate com o path — não só o primeiro: o extrator determinístico
    // (packages/graph) cria um nó alvo de import a partir do texto literal do import, sem
    // resolver o caminho relativo contra o documento real que o mesmo arquivo também vira ao ser
    // indexado diretamente — duas entradas de mesmo label, ids diferentes, é o comportamento
    // conhecido (não uma regressão desta spec). Usar todas garante que a aresta de quem importa o
    // arquivo seja encontrada independente de qual das duas o git-ls-files/SQL ordering colocou
    // primeiro.
    const originIds = new Set<EntityId>();
    for (const file of paths) {
      for (const candidate of allNodes) {
        if (candidate.label === file && (candidate.type === 'File' || candidate.type === 'Document' || candidate.type === 'Project')) originIds.add(candidate.id);
      }
    }
    // 'incoming': quem tem uma aresta DEPENDS_ON apontando PARA o arquivo alterado (i.e. quem importa
    // este arquivo) — é isso que pode quebrar com a mudança, não o que o arquivo alterado importa.
    const impactedNodeIds = new Set<string>();
    for (const originId of originIds) for (const node of graph.impact(originId, 2, 'incoming').nodes) impactedNodeIds.add(node.id);

    const architecture = architectureViolationsFor(paths, store);

    const observationStore = new SqliteObservationStore(database);
    const observations = observationStore.list().filter((observation) => observation.files.some((file) => paths.includes(file)));
    const historicalFailureRate = observations.length === 0 ? undefined : observations.filter((observation) => observation.outcome === 'failed').length / observations.length;

    const sensitive = inferSensitiveCategories(paths);
    const tested = testedRatio(paths);
    const services = new Set(paths.map(serviceUnit).filter((unit): unit is string => unit !== undefined));

    return {
      blastRadiusCount: impactedNodeIds.size,
      blastRadiusEvidenceIds: [...impactedNodeIds],
      architectureViolationCount: architecture.count,
      architectureViolationEvidenceIds: architecture.evidenceIds,
      sensitiveCategoriesTouched: sensitive.categories,
      sensitiveCategoryEvidenceIds: sensitive.evidenceIds,
      historicalFailureRate,
      historicalEvidenceIds: observations.map((observation) => observation.id),
      testedPathsRatio: tested.ratio,
      testEvidenceIds: tested.evidenceIds,
      touchesSchemaOrMigration: paths.some((file) => /migration|schema/i.test(file)),
      reversibilityEvidenceIds: paths.filter((file) => /migration|schema/i.test(file)),
      affectedServiceCount: services.size,
      totalServiceCount: totalServiceUnits(),
      deploymentEvidenceIds: [...services],
    };
  } finally {
    database.close();
  }
}

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
  const input = await buildInput(paths);
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
