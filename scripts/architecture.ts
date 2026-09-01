#!/usr/bin/env node
/**
 * architecture:compile / :check / :status / :explain / :approve (SPEC-033)
 *
 *   forja architecture:compile          ADRs (## Constraints) → .context/architecture/constitution.json
 *   forja architecture:check            constitution.json vs. Engineering Graph real
 *   forja architecture:status           resumo: N regras ativas, N propostas, última compilação
 *   forja architecture:explain <id>     ADR de origem, texto original, severidade
 *   forja architecture:approve <id>     promove uma regra proposed a active (via ApprovalLedger)
 *
 * `packages/engineering/architecture` faz o parsing/checagem pura; este script é o adapter que lê
 * `memory/90-decisions/*.md`, escreve `.context/architecture/constitution.json` (versionado em
 * git — revisável em PR, não uma linha de SQLite) e resolve as arestas DEPENDS_ON reais via o
 * mesmo GraphIndexer.sync que `adr:*`/`drift:check` já usam.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { checkConstitution, compileConstitution, explainRule, type AdrDocument, type ArchitectureRule, type DependencyEdge } from '../packages/engineering/architecture/src/index.ts';
import { ApprovalLedger } from '../packages/policy/src/index.ts';
import { GitGraphDocumentSource, SpawnCommandRunner } from '../packages/adapter-git/src/index.ts';
import { GraphIndexer, GraphLoop } from '../packages/graph/src/index.ts';
import { SqliteApprovalStore, SqliteGraphStore, SqliteMigrationRunner } from '../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../lib/workspace.ts';
import type { EntityId, ISO8601 } from '../packages/contracts/src/index.ts';

const CONSTITUTION_PATH = '.context/architecture/constitution.json';

function graphRoot(): string {
  return process.env.FORJA_GRAPH_ROOT ?? process.cwd();
}

function readAdrDocuments(): readonly AdrDocument[] {
  const dir = path.join(graphRoot(), 'memory', '90-decisions');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name !== '_template.md')
    .map((name) => ({ source: path.join('memory', '90-decisions', name), content: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

function loadConstitution(): { compiledAt?: string; rules: readonly ArchitectureRule[] } {
  const file = path.join(graphRoot(), CONSTITUTION_PATH);
  if (!fs.existsSync(file)) return { rules: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8')) as { compiledAt?: string; rules: readonly ArchitectureRule[] };
}

function saveConstitution(rules: readonly ArchitectureRule[]): void {
  const file = path.join(graphRoot(), CONSTITUTION_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ compiledAt: new Date().toISOString(), rules }, null, 2)}\n`);
}

function cmdCompile(): void {
  const adrs = readAdrDocuments();
  const rules = compileConstitution(adrs);
  saveConstitution(rules);
  const active = rules.filter((rule) => rule.status === 'active').length;
  console.log(`Compilado: ${rules.length} regra(s) de ${adrs.length} ADR(s) — ${active} active, ${rules.length - active} proposed.`);
  console.log(`Gravado em ${CONSTITUTION_PATH}`);
  if (rules.length - active > 0) console.log('Regras proposed precisam de `architecture:approve <rule-id>` para valer — ver `architecture:status`.');
}

async function dependencyEdges(): Promise<readonly DependencyEdge[]> {
  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const database = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(database).apply();
  const store = new SqliteGraphStore(database);
  const graph = new GraphLoop(store);
  const source = new GitGraphDocumentSource(graphRoot(), new SpawnCommandRunner());
  await new GraphIndexer(graph).sync(source);
  try {
    const edges: DependencyEdge[] = [];
    for (const edge of store.listEdges()) {
      if (edge.type !== 'DEPENDS_ON') continue;
      const fromNode = store.getNode(edge.from);
      const toNode = store.getNode(edge.to);
      if (fromNode === undefined || toNode === undefined) continue;
      edges.push({ fromPath: fromNode.label, targetLabel: toNode.label });
    }
    return edges;
  } finally {
    database.close();
  }
}

async function cmdCheck(): Promise<void> {
  const { rules } = loadConstitution();
  if (rules.length === 0) { console.log('Nenhuma regra compilada — rode `architecture:compile` primeiro.'); return; }
  const edges = await dependencyEdges();
  const report = checkConstitution(rules, edges);
  console.log(`\nARCHITECTURE DRIFT REPORT\n`);
  console.log(`✓ ${report.compliant} regra(s) active em conformidade\n`);
  if (report.violations.length === 0) { console.log('Nenhuma violação.'); return; }
  console.log('VIOLATIONS\n');
  for (const violation of report.violations) {
    console.log(`${violation.severity.toUpperCase()}`);
    console.log(`${violation.file}`);
    console.log(`viola: ${violation.ruleId} (${violation.source})`);
    console.log(`alvo: ${violation.target}`);
    console.log(`remediação: ${violation.remediation}\n`);
  }
  process.exitCode = 1;
}

function cmdStatus(): void {
  const { compiledAt, rules } = loadConstitution();
  const active = rules.filter((rule) => rule.status === 'active');
  const proposed = rules.filter((rule) => rule.status === 'proposed');
  console.log(`Última compilação: ${compiledAt ?? '(nunca — rode architecture:compile)'}`);
  console.log(`${active.length} regra(s) active, ${proposed.length} proposed.\n`);
  for (const rule of active) console.log(`  active    ${rule.id}  (${rule.constraint.kind}: ${rule.constraint.target})`);
  for (const rule of proposed) console.log(`  proposed  ${rule.id}  (confidence ${rule.confidence}) — precisa de architecture:approve`);
}

function cmdExplain([ruleId]: string[]): void {
  if (!ruleId) { console.error('Uso: forja architecture:explain <rule-id>'); process.exitCode = 1; return; }
  const { rules } = loadConstitution();
  const rule = explainRule(rules, ruleId);
  if (rule === undefined) { console.error(`Regra não encontrada: ${ruleId}. Rode architecture:status para ver os ids.`); process.exitCode = 1; return; }
  console.log(`${rule.id} — ${rule.status} (severidade: ${rule.severity}, confidence: ${rule.confidence})`);
  console.log(`origem: ${rule.source}`);
  console.log(`escopo: ${rule.scope.paths.join(', ')}`);
  console.log(`regra: ${rule.constraint.kind} → ${rule.constraint.target}`);
  console.log(`texto original: "${rule.rationale}"`);
}

async function cmdApprove([ruleId]: string[]): Promise<void> {
  if (!ruleId) { console.error('Uso: forja architecture:approve <rule-id>'); process.exitCode = 1; return; }
  const { rules } = loadConstitution();
  const rule = explainRule(rules, ruleId);
  if (rule === undefined) { console.error(`Regra não encontrada: ${ruleId}.`); process.exitCode = 1; return; }
  if (rule.status === 'active') { console.log(`${ruleId} já está active.`); return; }

  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const database = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(database).apply();
  const ledger = new ApprovalLedger(new SqliteApprovalStore(database));
  const now = new Date().toISOString() as ISO8601;
  try {
    const request = ledger.create({ action: 'architecture.rule.approve', justification: `Aprovação manual de regra de Constitution com confidence ${rule.confidence}: "${rule.rationale}"`, impact: `Regra ${ruleId} (${rule.constraint.kind} → ${rule.constraint.target}) passa a bloquear architecture:check`, expiresAt: '2099-01-01T00:00:00.000Z' as ISO8601, correlationId: `architecture:${ruleId}` }, now);
    ledger.decide(request.id, { decision: 'approved', approverId: (process.env.USER ?? 'operator') as EntityId, decidedAt: now });
  } finally {
    database.close();
  }

  const updated = rules.map((item) => (item.id === ruleId ? { ...item, status: 'active' as const } : item));
  saveConstitution(updated);
  console.log(`${ruleId} aprovado e promovido a active. Registrado no ApprovalLedger (correlationId: architecture:${ruleId}).`);
}

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);
  switch (subcommand) {
    case 'compile': return cmdCompile();
    case 'check': return cmdCheck();
    case 'status': return cmdStatus();
    case 'explain': return cmdExplain(rest);
    case 'approve': return cmdApprove(rest);
    default:
      console.error('Uso: forja architecture:<compile|check|status|explain|approve> [args]');
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\narchitecture: falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
