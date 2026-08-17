/** Creates a clearly labeled, isolated workspace for product demonstrations. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { initWorkspace, getWorkspaceContextDir, getWorkspaceDbPath, getWorkspaceRoot } from '../lib/workspace.ts';
import { SqliteMigrationRunner, SqliteObservationStore } from '../packages/adapter-sqlite/src/index.ts';
import { ObservabilityRecorder } from '../packages/observability/src/index.ts';

const PROJECT = 'atlas-pay';
const SENTINEL = 'forja-demo.json';

function usage(): never {
  console.error('Uso: forja demo:workspace [--path <diretório>] [--json]');
  process.exit(1);
}

function options(args: readonly string[]): { readonly root: string; readonly json: boolean } {
  let root = path.join(os.homedir(), 'forja-demo-workspace');
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--json') { json = true; continue; }
    if (args[index] === '--path' && args[index + 1]) { root = path.resolve(args[index + 1]); index += 1; continue; }
    usage();
  }
  return { root, json };
}

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function createFiles(root: string): void {
  const project = path.join(root, 'projects', PROJECT);
  write(path.join(project, 'README.md'), '# Atlas Pay (Demonstração)\n\nProjeto fictício criado por `forja demo:workspace`. Não use estes dados em produção.\n');
  write(path.join(project, 'docs', 'project-brief.md'), '# Briefing: Atlas Pay\n\nDemonstração de uma camada de aprovação para pagamentos empresariais.\n');
  write(path.join(project, 'memory', '20-architecture', 'stack.md'), '# Stack\n\n- API NestJS\n- SQLite local\n- Integração de pagamento simulada\n');
  write(path.join(project, 'memory', '20-architecture', 'design-brief.md'), '# Design brief\n\nDashboard operacional para aprovar pagamentos e revisar evidências.\n');
  write(path.join(project, 'memory', '40-delivery', 'current-sprint.md'), '# Sprint de demonstração\n\nObjetivo: aprovar pagamentos de alto valor com evidência e revisão.\n');
  write(path.join(root, 'specs', PROJECT, 'spec.md'), '# Spec: atlas-pay\n\n- **Status**: approved\n\n## Problema\nPagamentos empresariais de alto valor precisam de aprovação explícita.\n\n## Critérios de aceite\n- [x] Aprovação registrada antes da promoção.\n- [x] Auditoria consulta os handoffs da entrega.\n');
  write(path.join(root, 'specs', PROJECT, 'plan.md'), '# Plan: atlas-pay\n\n- **Status**: approved\n\nImplementar política de aprovação e trilha de auditoria.\n');
  write(path.join(root, 'specs', PROJECT, 'tasks.md'), '# Tasks: atlas-pay\n\n- **Status**: done\n\n- [x] Criar política de aprovação.\n- [x] Validar evidência antes de concluir.\n');
  write(path.join(getWorkspaceContextDir(), `gsd-${PROJECT}.md`), '# GSD: atlas-pay\n\nCenário de demonstração, gerado localmente.\n');
  write(path.join(getWorkspaceContextDir(), 'sprint-pack.md'), '# Contexto de demonstração\n\nAtlas Pay: aprovação de pagamento antes da promoção.\n');
  write(path.join(getWorkspaceContextDir(), 'llm-profiles.json'), `${JSON.stringify({ version: 1, profiles: {
    'demo-ollama': { provider: 'ollama', model: 'qwen2.5-coder', command: 'ollama', roles: ['worker'], taskTypes: ['implementation'], privacy: 'local', enabled: false },
  } }, null, 2)}\n`);
}

async function createDatabase(): Promise<void> {
  const db = new Database(getWorkspaceDbPath());
  try {
    new SqliteMigrationRunner(db).apply();
    db.exec(`CREATE TABLE IF NOT EXISTS handoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL, intent TEXT NOT NULL, context TEXT NOT NULL, acceptance TEXT NOT NULL,
      constraints TEXT NOT NULL, return_to TEXT NOT NULL, spec_slug TEXT, status TEXT DEFAULT 'open', payload_json TEXT
    );`);
    db.prepare('DELETE FROM handoffs WHERE spec_slug = ?').run(PROJECT);
    const insert = db.prepare('INSERT INTO handoffs (created_at, from_agent, to_agent, intent, context, acceptance, constraints, return_to, spec_slug, status, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const now = new Date().toISOString();
    const rows = [
      ['product', 'sdd-architect', 'plan', 'specs/atlas-pay/spec.md aprovado', 'plan.md com política e riscos', 'cenário demo; nenhuma integração externa', 'orchestrator', 'done'],
      ['sdd-architect', 'worker', 'implement', 'specs/atlas-pay/plan.md', 'política e validação implementadas', 'cenário demo; dados sintéticos', 'governance', 'done'],
      ['worker', 'governance', 'review', 'diff e checks do cenário Atlas Pay', 'validação independente aprovada', 'cenário demo; não promover para produção', 'orchestrator', 'open'],
    ];
    for (const [from, to, intent, context, acceptance, constraints, returnTo, status] of rows) {
      const payload = { from, to, intent, context, acceptance, constraints, return: returnTo, spec_slug: PROJECT, demo: true };
      insert.run(now, from, to, intent, context, acceptance, constraints, returnTo, PROJECT, status, JSON.stringify(payload));
    }
    const recorder = new ObservabilityRecorder(new SqliteObservationStore(db));
    for (const [outcome, durationMs, inputTokens, outputTokens] of [['succeeded', 1250, 820, 210], ['succeeded', 980, 740, 180], ['blocked', 110, 120, 0]] as const) {
      await recorder.record({ traceId: `demo:${randomUUID()}`, model: 'demo:local', inputHash: randomUUID(), contextRefs: ['.context/sprint-pack.md'], inputTokens, outputTokens, durationMs, tools: ['demo'], commands: ['forja demo:workspace'], outcome });
    }
  } finally { db.close(); }
}

export async function createDemoWorkspace(args: readonly string[] = process.argv.slice(2)): Promise<{ readonly workspace: string; readonly project: string; readonly handoffs: number; readonly observations: number }> {
  const { root, json } = options(args);
  process.env.FORJA_WORKSPACE = root;
  const sentinel = path.join(root, '.context', SENTINEL);
  if (fs.existsSync(root) && !fs.existsSync(sentinel)) throw new Error(`Recusado: ${root} não é um workspace demo. Escolha --path para um diretório vazio.`);
  initWorkspace();
  createFiles(getWorkspaceRoot());
  await createDatabase();
  const result = { workspace: getWorkspaceRoot(), project: PROJECT, handoffs: 3, observations: 3 };
  write(sentinel, `${JSON.stringify({ ...result, generatedAt: new Date().toISOString(), warning: 'Dados sintéticos para demonstração. Não use em produção.' }, null, 2)}\n`);
  if (json) console.log(JSON.stringify(result));
  else console.log(`Demo pronta em ${result.workspace}\nProjeto: ${PROJECT}\nHandoffs: 3 (2 concluídos, 1 em review)\nPróximo: FORJA_WORKSPACE="${result.workspace}" npm --prefix dashboard start`);
  return result;
}

if (process.argv[1]?.endsWith('demo-workspace.ts')) createDemoWorkspace().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
