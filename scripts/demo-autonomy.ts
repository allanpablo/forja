import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { CapabilityRegistry } from '../packages/core/src/index.ts';
import { ContextEngine, GraphContextSource } from '../packages/context/src/index.ts';
import { SqliteApprovalStore, SqliteAuditStore, SqliteCheckpointStore, SqliteContextCache, SqliteEventStore, SqliteGraphStore, SqliteMigrationRunner, SqliteObservationStore, SqliteOrchestrationStore, SqliteSandboxStore, SqliteRuntimePersistence } from '../packages/adapter-sqlite/src/index.ts';
import { GitGraphDocumentSource, GitWorktreeBackend, SpawnCommandRunner, type PatchApplier } from '../packages/adapter-git/src/index.ts';
import { GraphExecutionMemory, GraphIndexer, GraphLoop } from '../packages/graph/src/index.ts';
import { EventBus } from '../packages/events/src/index.ts';
import { ApprovalLedger, PolicyEngine } from '../packages/policy/src/index.ts';
import { RuntimeEngine } from '../packages/runtime/src/index.ts';
import { SandboxEngine } from '../packages/sandbox/src/index.ts';
import { SprintEngine, TaskEngine, HandoffEngine } from '../packages/orchestration/src/index.ts';
import { DeterministicValidator } from '../packages/validator/src/index.ts';
import type { CapabilityId, CapabilityOutput, EntityId, Evidence, EvaluationResult, ExecutionPlan, ISO8601, RunId, RuntimeRun, TokenBudget } from '../packages/contracts/src/index.ts';

interface CommandResult { readonly exitCode: number; readonly stdout: string; readonly stderr: string; }
interface DemoResult { readonly fixtureRoot: string; readonly databasePath: string; readonly runId: string; readonly sandboxRoot: string; readonly approvalId: string; readonly changedFiles: readonly string[]; readonly graphNodes: number; readonly graphEdges: number; readonly handoffId: string; readonly validation: EvaluationResult['status']; }

const now = (): ISO8601 => new Date().toISOString() as ISO8601;
const budget: TokenBudget = { inputTokens: 600, outputTokens: 300, totalTokens: 900, usedTokens: 0 };

function command(executable: string, args: readonly string[], cwd: string, input?: string): CommandResult {
  const result = spawnSync(executable, [...args], { cwd, input, encoding: 'utf8', stdio: 'pipe' });
  return { exitCode: result.status ?? 1, stdout: result.stdout ?? '', stderr: [result.stderr ?? '', result.error?.message ?? ''].filter(Boolean).join('\n') };
}

function mustCommand(executable: string, args: readonly string[], cwd: string, input?: string): CommandResult {
  const result = command(executable, args, cwd, input);
  if (result.exitCode !== 0) throw new Error(`${executable} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result;
}

function createFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-autonomy-fixture-'));
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'forja-autonomy-fixture', private: true, type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'math.js'), 'export function add(left, right) { return left + right; }\n');
  fs.writeFileSync(path.join(root, 'tests', 'math.test.js'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../math.js';\n\ntest('add adds two numbers', () => { assert.equal(add(1, 1), 3); });\n");
  fs.writeFileSync(path.join(root, '.gitignore'), '.forja/\nnode_modules/\n');
  mustCommand('git', ['init', '-q'], root);
  mustCommand('git', ['config', 'user.email', 'forja-demo@example.invalid'], root);
  mustCommand('git', ['config', 'user.name', 'Forja Demo Agent'], root);
  mustCommand('git', ['add', '.'], root);
  mustCommand('git', ['commit', '-qm', 'fixture: introduce failing test'], root);
  return root;
}

class GitPatchApplier implements PatchApplier {
  apply(root: string, patch: string): void {
    const patchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-promotion-'));
    const patchFile = path.join(patchRoot, 'promotion.patch');
    try {
      fs.writeFileSync(patchFile, patch);
      mustCommand('git', ['-C', root, 'apply', '--binary', patchFile], root);
    } finally {
      fs.rmSync(patchRoot, { recursive: true, force: true });
    }
  }

  revert(root: string, patch: string): void {
    const patchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-rollback-'));
    const patchFile = path.join(patchRoot, 'rollback.patch');
    try {
      fs.writeFileSync(patchFile, patch);
      mustCommand('git', ['-C', root, 'apply', '--reverse', '--binary', patchFile], root);
    } finally {
      fs.rmSync(patchRoot, { recursive: true, force: true });
    }
  }
}

function evidence(source: string, locator: string, status: 'verified' | 'inferred' | 'hypothesis' | 'contradicted' | 'unknown' = 'verified'): Evidence {
  return { id: randomUUID() as EntityId, source, locator, capturedAt: now(), status };
}

function createPlan(runId: string, testFile: string, evidenceIds: readonly EntityId[]): ExecutionPlan {
  const fields = { schemaVersion: '2.0' as const, createdAt: now(), updatedAt: now(), correlationId: `plan:${runId}` };
  return {
    ...fields,
    id: `plan:${runId}` as EntityId,
    objective: 'Corrigir teste falhando na fixture externa',
    risk: 'medium',
    budget,
    evidenceIds,
    steps: [{
      ...fields,
      id: `step:${runId}` as EntityId,
      objective: 'Corrigir a expectativa do teste da fixture',
      acceptanceCriteria: ['npm test passa na fixture', 'diff contém somente o teste falho'],
      allowedFiles: [testFile],
      dependencyIds: [],
      evidenceIds,
      risk: 'medium',
      budget,
      status: 'ready',
    }],
  };
}

export async function runAutonomyDemo(): Promise<DemoResult> {
  const fixtureRoot = createFixture();
  const databasePath = path.join(fixtureRoot, '.forja', 'runtime.db');
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  new SqliteMigrationRunner(database).apply();
  const correlationId = `demo:${randomUUID()}`;
  const runId = `run:${randomUUID()}`;
  const agent = { id: 'agent.demo' as EntityId, name: 'Forja deterministic demo agent', role: 'developer', autonomy: 'supervised' as const };
  const testFile = 'tests/math.test.js';
  const initialEvidence = evidence('fixture', testFile);
  const runner = new SpawnCommandRunner();
  const graph = new GraphLoop(new SqliteGraphStore(database));
  const graphSource = new GitGraphDocumentSource(fixtureRoot, runner);
  const graphBefore = await new GraphIndexer(graph).sync(graphSource);
  const context = await new ContextEngine({
    graph: new GraphContextSource({ searchContext: (objective) => graph.contextRecords(objective) }),
    cache: new SqliteContextCache(database),
  }).build({ objective: 'corrigir teste falhando math.test.js', budget, includeContent: true, requireEvidence: false, correlationId });
  const approvals = new ApprovalLedger(new SqliteApprovalStore(database));
  let approved = false;
  const policy = new PolicyEngine({
    rules: [{ id: 'demo-code-write', priority: 100, effect: 'REQUIRE_APPROVAL', reason: 'Alteração de código exige aprovação humana', scope: { agentIds: [agent.id], capabilityIds: ['fixture.code.write'], environments: ['local'], categories: ['write'] } }],
    approvalLedger: approvals,
  });
  const patchApplier = new GitPatchApplier();
  const sandbox = new SandboxEngine(new SqliteSandboxStore(database), new GitWorktreeBackend(runner, { repositoryRoot: fixtureRoot, sourceRef: 'HEAD', patchApplier }));
  const session = await sandbox.create({ runId: runId as RunId, root: path.join(fixtureRoot, '..', `${path.basename(fixtureRoot)}-worktree`), correlationId });
  await sandbox.prepare(session.id);
  const registry = new CapabilityRegistry();
  const capabilityId = 'fixture.code.write' as CapabilityId;
  registry.register({
    definition: { schemaVersion: '2.0', createdAt: now(), updatedAt: now(), correlationId, id: capabilityId, version: '1.0.0', description: 'Corrige a expectativa do teste da fixture em sandbox Git real', permissions: ['write'], risk: 'medium', sideEffects: ['sandbox_write'], requirements: ['git', 'npm'], supportsAutonomy: false, idempotent: true, timeoutMs: 60_000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [] },
    validateInput: (input: unknown) => { if (input !== undefined && (typeof input !== 'object' || input === null)) throw new Error('fixture.code.write input must be an object'); return {}; },
    validateOutput: (output: unknown) => output as Record<string, unknown>,
    handler: async (): Promise<CapabilityOutput> => {
      const worktreeFile = path.join(session.root, testFile);
      const source = fs.readFileSync(worktreeFile, 'utf8');
      if (!source.includes('assert.equal(add(1, 1), 3)')) throw new Error('Expected failing assertion was not found');
      fs.writeFileSync(worktreeFile, source.replace('assert.equal(add(1, 1), 3)', 'assert.equal(add(1, 1), 2)'));
      const testExecution = await sandbox.execute(session.id, { executable: process.execPath, args: ['--test'], cwd: session.root });
      if (testExecution.exitCode !== 0) throw new Error(`Fixture tests failed after edit: ${testExecution.stderr || testExecution.stdout}`);
      const validation = await sandbox.validate(session.id);
      if (validation.status !== 'accepted') throw new Error(validation.summary);
      const testEvidence = evidence('sandbox.npm.test', `${testFile}:npm test`);
      const editEvidence = evidence('sandbox.agent', testFile);
      return { capabilityId, payload: { changedFile: testFile, testExitCode: testExecution.exitCode, stdout: testExecution.stdout, validation: validation.summary }, evidence: [initialEvidence, editEvidence, testEvidence] };
    },
  });
  const runtime = new RuntimeEngine({
    registry,
    planner: { plan: () => [{ capabilityId, payload: {}, estimatedTokens: 80, files: [testFile], environment: 'local', categories: ['write'], approval: { action: 'code.write', justification: 'Corrigir a asserção determinística que falha na fixture', impact: 'Altera somente tests/math.test.js dentro do worktree', expectedDiff: testFile, expiresAt: '2099-01-01T00:00:00.000Z' as ISO8601 } }] },
    contextBuilder: { build: () => context },
    checkpointStore: new SqliteCheckpointStore(database),
    persistence: new SqliteRuntimePersistence(database),
    memory: new GraphExecutionMemory(graph),
    validator: { validate: (run: RuntimeRun, results) => {
      const plan = createPlan(run.runId, testFile, [...new Set([...context.references.map((item) => item.id), ...results.flatMap((result) => result.evidence.map((item) => item.id))])]);
      const successfulResults = results.filter((result) => result.status === 'succeeded');
      const testEvidenceIds = successfulResults.flatMap((result) => result.evidence.map((item) => item.id));
      const testPassed = successfulResults.length > 0;
      return new DeterministicValidator().validate({ plan, changedFiles: run.changedFiles, checks: [{ name: 'build', passed: true, evidenceIds: [] }, { name: 'tests', passed: testPassed, evidenceIds: testEvidenceIds }, { name: 'diff', passed: true, evidenceIds: testEvidenceIds }, { name: 'typecheck', passed: true, evidenceIds: [] }, { name: 'lint', passed: true, evidenceIds: [] }], acceptance: [{ criterion: 'npm test passa na fixture', passed: testPassed, evidenceIds: testEvidenceIds }, { criterion: 'diff contém somente o teste falho', passed: run.changedFiles.length === 1 && run.changedFiles[0] === testFile, evidenceIds: [] }], correlationId: run.correlationId });
    } },
  });
  const started = await runtime.start({ objective: 'Corrigir teste falhando na fixture externa', agent, budget, policy: { authorize: (request) => approved ? { effect: 'ALLOW', reason: 'Aprovação humana registrada', policyId: 'demo-approved' } : policy.authorize(request) }, correlationId });
  const awaiting = await runtime.execute(started.runId);
  if (awaiting.state !== 'awaiting_approval') throw new Error(`Expected approval gate, got ${awaiting.state}`);
  const approval = approvals.list().find((item) => item.action === 'code.write');
  if (approval === undefined) throw new Error('Approval was not persisted');
  approvals.decide(approval.id, { decision: 'approved', approverId: 'human.demo' as EntityId, decidedAt: now() });
  approved = true;
  const completed = await runtime.resume(started.runId);
  if (completed.state !== 'completed' || completed.validation?.status !== 'accepted') throw new Error(`Runtime did not complete with accepted validation: ${completed.state}/${completed.validation?.status}`);
  const diff = await sandbox.diff(session.id);
  const promoted = await sandbox.promote(session.id, diff);
  const promotedTests = mustCommand(process.execPath, ['--test'], fixtureRoot);
  await sandbox.destroy(session.id);
  const graphAfter = await new GraphIndexer(graph).sync(graphSource);
  const audit = new SqliteAuditStore(database);
  audit.append({ schemaVersion: '2.0', id: randomUUID() as EntityId, action: 'demo.autonomy.promote', aggregateId: completed.runId as unknown as EntityId, outcome: 'success', evidenceIds: [...completed.evidence, initialEvidence].map((item) => item.id), details: { fixtureRoot, sandboxRoot: session.root, promotedState: promoted.state, testExitCode: String(promotedTests.exitCode) }, correlationId, createdAt: now(), updatedAt: now() });
  const orchestrationStore = new SqliteOrchestrationStore(database);
  const sprintEngine = new SprintEngine(orchestrationStore);
  const sprint = await sprintEngine.create({ objective: 'Prova de autonomia supervisionada real', includedScope: [testFile], excludedScope: ['production'], budget, completionCriteria: ['Validator accepted'], risks: ['Git promotion'], evidenceIds: [...completed.evidence].map((item) => item.id), correlationId });
  await sprintEngine.start(sprint.id);
  const taskEngine = new TaskEngine(orchestrationStore, sprintEngine);
  const task = await taskEngine.create({ sprintId: sprint.id, objective: 'Corrigir teste falhando', acceptanceCriteria: ['npm test passa na fixture'], allowedFiles: [testFile], dependencyIds: [], evidenceIds: [...completed.evidence].map((item) => item.id), budget, correlationId });
  await taskEngine.start(task.id);
  const accepted: EvaluationResult = completed.validation as EvaluationResult;
  await taskEngine.complete(task.id, { validateTask: () => accepted, validateSprint: () => accepted });
  await sprintEngine.complete(sprint.id, { validateTask: () => accepted, validateSprint: () => accepted });
  const handoff = await new HandoffEngine(orchestrationStore).create({ from: 'agent.demo', to: 'human.reviewer', intent: 'review promoted fixture fix', objective: completed.objective, completedWork: ['Context built', 'Approval recorded', 'Real worktree edited', 'npm test passed', 'Diff promoted'], decisions: ['Promotion required explicit approval'], constraints: ['Fixture-only scope'], pending: [], evidenceIds: [...completed.evidence].map((item) => item.id), acceptance: ['Validator accepted'], blockers: [], nextAgent: 'human.reviewer', correlationId });
  const events = new EventBus(new SqliteEventStore(database));
  await events.append({ type: 'execution.completed', aggregateId: completed.runId as unknown as EntityId, payload: { validation: completed.validation?.status, promoted: promoted.promoted }, idempotencyKey: `execution.completed:${completed.runId}`, correlationId });
  const result: DemoResult = { fixtureRoot, databasePath, runId: completed.runId, sandboxRoot: session.root, approvalId: approval.id, changedFiles: diff.files, graphNodes: graphAfter.nodes + graphBefore.nodes, graphEdges: graphAfter.edges + graphBefore.edges, handoffId: handoff.id, validation: completed.validation?.status ?? 'inconclusive' };
  database.close();
  return result;
}

if (process.argv[1]?.endsWith('demo-autonomy.ts')) {
  runAutonomyDemo().then((result) => { console.log(JSON.stringify(result, null, 2)); }).catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
}
