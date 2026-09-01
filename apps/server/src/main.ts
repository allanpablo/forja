import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CapabilityRegistry } from '../../../packages/core/src/index.ts';
import { PolicyEngine, type PolicyRule } from '../../../packages/policy/src/index.ts';
import { McpServer } from '../../../packages/mcp/src/index.ts';
import { ControlPlane, InMemoryObservationStore, ObservabilityRecorder, type ObservationStore } from '../../../packages/observability/src/index.ts';
import { ApprovalLedger } from '../../../packages/policy/src/index.ts';
import { HandoffEngine, InMemoryOrchestrationStore, SprintEngine, TaskEngine, type OrchestrationStore } from '../../../packages/orchestration/src/index.ts';
import { validateTokenBudget, type EntityId, type ISO8601 } from '../../../packages/contracts/src/index.ts';
import { createBearerAuthenticator, InMemoryEventStream, type LocalAuthenticator } from '../../../packages/adapter-nest/src/index.ts';
import { AppModule } from './app.module.ts';
import { RuntimeEngine, type RuntimePlanStep } from '../../../packages/runtime/src/index.ts';
import { GraphExecutionMemory, GraphLoop } from '../../../packages/graph/src/index.ts';
import { ContextEngine, GraphContextSource } from '../../../packages/context/src/index.ts';
import { SqliteContextCache, SqliteGraphStore, SqliteMigrationRunner, SqliteRuntimePersistence } from '../../../packages/adapter-sqlite/src/index.ts';
import { SqliteApprovalStore, SqliteMcpAuditSink, SqliteObservationStore, SqliteOrchestrationStore } from '../../../packages/adapter-sqlite/src/index.ts';
import { EventBus } from '../../../packages/events/src/index.ts';
import { SqliteEventStore } from '../../../packages/adapter-sqlite/src/index.ts';
import { getWorkspaceDbDir, getWorkspaceDbPath } from '../../../lib/workspace.ts';
import type { RuntimePersistence } from '../../../packages/runtime/src/index.ts';
import { createLegacyCliRunner, registerCliCapabilities } from '../../cli/src/index.ts';
import { registerGraphSyncCapability } from '../../cli/src/index.ts';
import { GitGraphDocumentSource, SpawnCommandRunner } from '../../../packages/adapter-git/src/index.ts';
import type { AgentIdentity, EvaluationResult, ExecutionResult, TokenBudget } from '../../../packages/contracts/src/index.ts';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function createDefaultCapabilityRegistry(root = serverRoot, cwd = process.cwd()): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registerCliCapabilities(registry, createLegacyCliRunner(root, cwd));
  return registry;
}

export function createDefaultMcp(registry = createDefaultCapabilityRegistry(), policy = createDefaultPolicy(), graph = new GraphLoop(), audit?: import('../../../packages/mcp/src/index.ts').McpAuditSink, context?: ContextEngine): McpServer {
  return new McpServer({ registry, policy, graph, audit, context, agent: { id: 'local-server' as EntityId, name: 'Forja local server', role: 'server', autonomy: 'supervised', permissions: ['read', 'write', 'execution', 'database'], capabilities: registry.list().map((definition) => definition.id) } });
}

export function createDefaultPolicy(): PolicyEngine {
  const readOnlyRule: PolicyRule = { id: 'local-read-only', priority: 10, effect: 'ALLOW', reason: 'Default local server permits read capabilities only', scope: { categories: ['read'], environments: ['local'] } };
  return new PolicyEngine({ rules: [readOnlyRule] });
}

export function createLocalAuthenticator(token = process.env.FORJA_AUTH_TOKEN): LocalAuthenticator | undefined {
  if (token === undefined || token.length === 0) return undefined;
  return createBearerAuthenticator(token);
}

interface RuntimeRequestContext { readonly steps: readonly RuntimePlanStep[]; readonly budget: TokenBudget; }

class DefaultRuntimeApplication {
  private readonly contexts = new Map<string, RuntimeRequestContext>();
  private readonly runtime: RuntimeEngine;
  private readonly policy: PolicyEngine;

  constructor(registry: CapabilityRegistry, policy: PolicyEngine, persistence?: RuntimePersistence, graph?: GraphLoop, context?: ContextEngine) {
    this.policy = policy;
    this.runtime = new RuntimeEngine({
      registry,
      planner: { plan: (_objective, context) => { if (!isRecord(context) || !Array.isArray(context.steps)) throw new Error('Runtime plan context is missing'); return context.steps as readonly RuntimePlanStep[]; } },
      contextBuilder: { build: async (objective) => { const request = this.contexts.get(objective); if (request === undefined) return undefined; const contextPackage = context === undefined ? undefined : await context.build({ objective, budget: request.budget, requireEvidence: false }); return { ...request, contextPackage }; } },
      validator: { validate: (run, results) => this.validate(run, results) },
      persistence,
      memory: graph === undefined ? undefined : new GraphExecutionMemory(graph),
    });
  }

  async start(input: unknown): Promise<unknown> {
    const value = runtimeInput(input);
    this.contexts.set(value.objective, { steps: value.steps, budget: value.budget });
    try { return await this.runtime.start({ objective: value.objective, agent: value.agent, budget: value.budget, policy: this.policy, sprintId: value.sprintId, taskId: value.taskId, correlationId: value.correlationId }); }
    finally { this.contexts.delete(value.objective); }
  }
  async execute(id: unknown): Promise<unknown> { return this.executeWithRecovery(id as string); }
  async get(id: unknown): Promise<unknown> { return this.getWithRecovery(id as string); }
  pause(id: unknown): unknown { return this.runtime.pause(id as never); }
  resume(id: unknown): Promise<unknown> { return this.runtime.resume(id as never, this.policy); }
  cancel(id: unknown): Promise<unknown> { return this.runtime.cancel(id as never); }

  private async getWithRecovery(id: string): Promise<unknown> {
    try { return this.runtime.get(id as never); }
    catch { await this.runtime.recover(id as never, this.policy); return this.runtime.get(id as never); }
  }

  private async executeWithRecovery(id: string): Promise<unknown> {
    try { return await this.runtime.execute(id as never); }
    catch { await this.runtime.recover(id as never, this.policy); return this.runtime.execute(id as never); }
  }

  private validate(run: Parameters<NonNullable<ConstructorParameters<typeof RuntimeEngine>[0]['validator']['validate']>>[0], results: readonly ExecutionResult[]): EvaluationResult {
    const passed = results.length === run.steps && results.every((result) => result.status === 'succeeded' && result.evidence.length > 0);
    const now = new Date().toISOString() as ISO8601;
    return { schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: run.correlationId, status: passed ? 'accepted' : 'rejected', checks: [{ name: 'capabilities-succeeded-with-evidence', passed, evidenceIds: results.flatMap((result) => result.evidence.map((item) => item.id)) }], summary: passed ? 'All runtime steps succeeded with evidence' : 'Runtime step failed or lacked evidence' };
  }
}

function runtimeInput(input: unknown): { readonly objective: string; readonly agent: AgentIdentity; readonly budget: TokenBudget; readonly steps: readonly RuntimePlanStep[]; readonly sprintId?: EntityId; readonly taskId?: EntityId; readonly correlationId?: string } {
  if (!isRecord(input) || typeof input.objective !== 'string' || typeof input.agent !== 'object' || input.agent === null || !isRecord(input.agent) || typeof input.budget !== 'object' || input.budget === null || !isRecord(input.budget) || !Array.isArray(input.steps)) throw new Error('Runtime requires objective, agent, budget and steps');
  const agent = input.agent as unknown as AgentIdentity;
  const budget = input.budget as unknown as TokenBudget;
  if (input.objective.trim().length === 0 || typeof agent.id !== 'string' || typeof agent.name !== 'string' || typeof agent.role !== 'string') throw new Error('Runtime agent and objective are invalid');
  validateTokenBudget(budget);
  const steps = input.steps.map((step) => { if (!isRecord(step) || typeof step.capabilityId !== 'string' || typeof step.estimatedTokens !== 'number') throw new Error('Runtime step requires capabilityId and estimatedTokens'); return step as unknown as RuntimePlanStep; });
  if (steps.length === 0) throw new Error('Runtime requires at least one capability step');
  return { objective: input.objective, agent, budget, steps, sprintId: typeof input.sprintId === 'string' ? input.sprintId as EntityId : undefined, taskId: typeof input.taskId === 'string' ? input.taskId as EntityId : undefined, correlationId: typeof input.correlationId === 'string' ? input.correlationId : undefined };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }

export function createDefaultControlPlane(eventStream: InMemoryEventStream, registry = createDefaultCapabilityRegistry(), policy = createDefaultPolicy(), persistence?: RuntimePersistence, approvals = new ApprovalLedger(), events?: EventBus, graph?: GraphLoop, context?: ContextEngine, orchestrationStore: OrchestrationStore = new InMemoryOrchestrationStore(), observationStore: ObservationStore = new InMemoryObservationStore()): ControlPlane {
  const store = orchestrationStore;
  const sprintEngine = new SprintEngine(store);
  const taskEngine = new TaskEngine(store, sprintEngine);
  const handoffEngine = new HandoffEngine(store);
  const runtime = new DefaultRuntimeApplication(registry, policy, persistence, graph, context);
  return new ControlPlane(new ObservabilityRecorder(observationStore), {
    runtime: { start: (input) => runtime.start(input), get: (input) => runtime.get(input), execute: (input) => runtime.execute(input), pause: (input) => runtime.pause(input), resume: (input) => runtime.resume(input), cancel: (input) => runtime.cancel(input) },
    sprint: { create: (input) => sprintEngine.create(input as Parameters<SprintEngine['create']>[0]), start: (id) => sprintEngine.start(id as EntityId), pause: (id) => sprintEngine.pause(id as EntityId) },
    task: { create: (input) => taskEngine.create(input as Parameters<TaskEngine['create']>[0]), start: (id) => taskEngine.start(id as EntityId), block: (id) => taskEngine.block(id as EntityId) },
    handoff: { create: (input) => handoffEngine.create(input as Parameters<HandoffEngine['create']>[0]) },
    approvals: { get: (id) => approvals.get(id as EntityId), list: () => approvals.list(), decide: (input) => { const value = input as { readonly id: string; readonly input: { readonly decision: 'approved' | 'rejected'; readonly approverId: EntityId; readonly decidedAt?: ISO8601 } }; return approvals.decide(value.id as EntityId, { decision: value.input.decision, approverId: value.input.approverId, decidedAt: value.input.decidedAt ?? new Date().toISOString() as ISO8601 }); } },
    events: { publish: (event) => { eventStream.publish({ id: event.id, event: event.type, data: event.data, correlationId: event.correlationId }); void events?.append({ type: event.type, aggregateId: event.aggregateId as EntityId, payload: event.data, idempotencyKey: `${event.type}:${event.id}`, correlationId: event.correlationId }); } },
  });
}

export async function bootstrap(port = Number(process.env.FORJA_PORT ?? 3000)) {
  const eventStream = new InMemoryEventStream();
  const registry = createDefaultCapabilityRegistry();
  const policy = createDefaultPolicy();
  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const runtimeDatabase = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(runtimeDatabase).apply();
  const runtimePersistence = new SqliteRuntimePersistence(runtimeDatabase);
  const approvals = new ApprovalLedger(new SqliteApprovalStore(runtimeDatabase));
  const mcpAudit = new SqliteMcpAuditSink(runtimeDatabase);
  const events = new EventBus(new SqliteEventStore(runtimeDatabase));
  const graph = new GraphLoop(new SqliteGraphStore(runtimeDatabase));
  const orchestrationStore = new SqliteOrchestrationStore(runtimeDatabase);
  const observationStore = new SqliteObservationStore(runtimeDatabase);
  registerGraphSyncCapability(registry, graph, new GitGraphDocumentSource(process.env.FORJA_GRAPH_ROOT ?? process.cwd(), new SpawnCommandRunner()));
  const context = new ContextEngine({ graph: new GraphContextSource({ searchContext: (objective) => graph.contextRecords(objective) }), cache: new SqliteContextCache(runtimeDatabase) });
  const mcp = createDefaultMcp(registry, policy, graph, mcpAudit, context);
  const authenticator = createLocalAuthenticator();
  if (authenticator === undefined) console.warn('[forja] FORJA_AUTH_TOKEN is not set — only loopback (127.0.0.1/::1) requests will be accepted. Set FORJA_AUTH_TOKEN before exposing this server beyond localhost.');
  const app = await NestFactory.create(AppModule.register({ mcp, eventStream, authenticator, controlPlane: createDefaultControlPlane(eventStream, registry, policy, runtimePersistence, approvals, events, graph, context, orchestrationStore, observationStore) }));
  const config = new DocumentBuilder().setTitle('ForjaJS 2.0 API').setDescription('Local-first agent control plane').setVersion('2.0.0').build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(port, '127.0.0.1');
  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`[forja] received ${signal}, closing database and shutting down`);
    void app.close().finally(() => { runtimeDatabase.close(); process.exit(0); });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) void bootstrap();
