/**
 * lib/core/risk-collect.ts — coleta os números reais de um `RiskInput` (SPEC-034) a partir do
 * grafo/constitution/histórico já persistidos.
 *
 * Extraído de `scripts/risk.ts` para ser reaproveitado por `scripts/engineer.ts` (SPEC-035) sem
 * duplicar a lógica — os dois adapters precisam exatamente do mesmo `RiskInput` para o mesmo
 * conjunto de arquivos alterados, só mudam o que fazem com o `ChangeRiskAssessment` resultante.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkConstitution, type ArchitectureRule, type DependencyEdge } from '../../packages/engineering/architecture/src/index.ts';
import type { RiskInput } from '../../packages/engineering/risk/src/index.ts';
import { GitGraphDocumentSource, SpawnCommandRunner } from '../../packages/adapter-git/src/index.ts';
import { GraphIndexer, GraphLoop } from '../../packages/graph/src/index.ts';
import { SqliteGraphStore, SqliteObservationStore, type SqliteConnection } from '../../packages/adapter-sqlite/src/index.ts';
import type { EntityId } from '../../packages/contracts/src/index.ts';

const CONSTITUTION_PATH = '.context/architecture/constitution.json';

export function graphRoot(): string {
  return process.env.FORJA_GRAPH_ROOT ?? process.cwd();
}

export function changedFiles(ref?: string): readonly string[] {
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

/** `undefined` (não `{ count: 0 }`) quando `constitution.json` não foi compilado ainda — chamador decide como sinalizar isso. */
export function architectureViolationsFor(paths: readonly string[], store: SqliteGraphStore): { count: number; evidenceIds: readonly string[] } | undefined {
  const constitutionFile = path.join(graphRoot(), CONSTITUTION_PATH);
  if (!fs.existsSync(constitutionFile)) return undefined;
  const { rules } = JSON.parse(fs.readFileSync(constitutionFile, 'utf8')) as { rules: readonly ArchitectureRule[] };
  const report = checkConstitution(rules, dependencyEdgesFrom(store));
  const scoped = report.violations.filter((violation) => paths.includes(violation.file));
  return { count: scoped.length, evidenceIds: scoped.map((violation) => `${violation.ruleId}:${violation.file}`) };
}

/** Monta o `RiskInput` real para `paths` — grafo reindexado, violações escopadas, histórico, heurísticas de path. Fecha `database` ao terminar? Não: quem abriu decide (chamadores compartilham a mesma conexão com outras coletas). */
export async function buildRiskInput(paths: readonly string[], database: SqliteConnection): Promise<RiskInput> {
  const store = new SqliteGraphStore(database);
  const graph = new GraphLoop(store);
  await new GraphIndexer(graph).sync(new GitGraphDocumentSource(graphRoot(), new SpawnCommandRunner()));

  const allNodes = store.listNodes();
  // Todos os nós cujo label bate com o path — não só o primeiro: o extrator determinístico
  // (packages/graph) cria um nó alvo de import a partir do texto literal do import, sem resolver
  // o caminho relativo contra o documento real que o mesmo arquivo também vira ao ser indexado
  // diretamente — duas entradas de mesmo label, ids diferentes, é o comportamento conhecido (não
  // uma regressão desta spec). Usar todas garante que a aresta de quem importa o arquivo seja
  // encontrada independente de qual das duas o git-ls-files/SQL ordering colocou primeiro.
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

  const architecture = architectureViolationsFor(paths, store) ?? { count: 0, evidenceIds: [] };

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
}
