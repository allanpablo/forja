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
import { createBearerAuthenticator, InMemoryEventStream, planningOpenApiPaths, type LocalAuthenticator } from '../../../packages/adapter-nest/src/index.ts';
import { AppModule } from './app.module.ts';
import { RuntimeEngine, type RuntimePlanStep } from '../../../packages/runtime/src/index.ts';
import { TaskRuntimeCoordinator, type TaskRuntimeInput, type TaskRuntimeValidator } from './task-runtime-coordinator.ts';
import { TaskPlanningService } from './task-planning-service.ts';
import { InMemoryPlanningStore, PlanningError, type PlanningStore } from '../../../packages/planner/src/proposal-store.ts';
import { SqlitePlanningStore } from '../../../packages/adapter-sqlite/src/index.ts';
import type { ContextSource } from '../../../packages/context/src/index.ts';

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
import type { AgentIdentity, CapabilityId, EvaluationResult, RunId, RuntimeRun, TokenBudget } from '../../../packages/contracts/src/index.ts';

export interface ServerPlanningOptions {
  readonly executor?: AgentIdentity;
  readonly reviewer?: AgentIdentity;
  readonly memory?: ContextSource;
  readonly store?: PlanningStore;
}

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function createDefaultCapabilityRegistry(root = serverRoot, cwd = process.cwd()): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registerCliCapabilities(registry, createLegacyCliRunner(root, cwd));
  return registry;
}

export function createDefaultMcp(registry = createDefaultCapabilityRegistry(), policy = createDefaultPolicy(), graph = new GraphLoop(), audit?: import('../../../packages/mcp/src/index.ts').McpAuditSink, context?: ContextEngine, orchestration?: { readonly taskEngine: TaskEngine; readonly handoffEngine: HandoffEngine }, planning?: import('../../../packages/mcp/src/index.ts').McpPlanning): McpServer {
  const store = new InMemoryOrchestrationStore();
  const services = orchestration ?? { taskEngine: new TaskEngine(store, new SprintEngine(store)), handoffEngine: new HandoffEngine(store) };
  const agent = { id: 'local-server' as EntityId, name: 'Forja local server', role: 'server', autonomy: 'supervised' as const, permissions: ['read', 'write', 'execution', 'database'], capabilities: registry.list().map((definition) => definition.id) };
  return new McpServer({ registry, policy, graph, audit, context, planning, ...services, agent, mcpPolicy: { authorize: ({ action, category, risk, files }) => {
    const now = new Date().toISOString() as ISO8601;
    return policy.authorize({ agent, environment: 'local', categories: [category], files, now, definition: { schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: action, id: action as CapabilityId, version: '1.0.0', description: action, permissions: [category], risk, sideEffects: category === 'read' ? [] : [category], requirements: [], supportsAutonomy: false, idempotent: category === 'read', timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [] } });
  } } });
}

export function createDefaultPolicy(approvals = new ApprovalLedger()): PolicyEngine {
  const readOnlyRule: PolicyRule = { id: 'local-read-only', priority: 10, effect: 'ALLOW', reason: 'Default local server permits read capabilities only', scope: { categories: ['read'], environments: ['local'] } };
  return new PolicyEngine({ rules: [readOnlyRule], approvalLedger: approvals });
}

export function createLocalAuthenticator(token = process.env.FORJA_AUTH_TOKEN): LocalAuthenticator | undefined {
  if (token === undefined || token.length === 0) return undefined;
  return createBearerAuthenticator(token);
}

class DefaultRuntimeApplication {
  private readonly coordinator: TaskRuntimeCoordinator;

  constructor(registry: CapabilityRegistry, policy: PolicyEngine, store: OrchestrationStore, tasks: TaskEngine, persistence?: RuntimePersistence, graph?: GraphLoop, private readonly context?: ContextEngine, validator?: TaskRuntimeValidator) {
    const runtime = new RuntimeEngine({
      registry,
      planner: { plan: (_objective, context) => { if (!isRecord(context) || !Array.isArray(context.steps)) throw new Error('Runtime plan context is missing'); return context.steps as readonly RuntimePlanStep[]; } },
      validator: { validate: async (run, results) => {
        const linked = await this.coordinator.validationContext(run);
        return validator === undefined ? this.validate(run) : validator.validate(run, results, linked);
      } },
      persistence,
      beforeExecution: (run) => this.coordinator.executionStarted(run),
      memory: graph === undefined ? undefined : new GraphExecutionMemory(graph),
    });
    this.coordinator = new TaskRuntimeCoordinator(runtime, policy, store, tasks, persistence);
  }

  initialize(): Promise<void> { return this.coordinator.initialize(); }
  async start(input: unknown): Promise<RuntimeRun> {
    const value = runtimeInput(input);
    const contextPackage = await this.context?.build({ objective: value.objective, budget: value.budget, requireEvidence: false });
    return this.coordinator.start(value, { steps: value.steps, budget: value.budget, contextPackage });
  }
  execute(id: unknown): Promise<RuntimeRun> { return this.coordinator.execute(this.runId(id)); }
  get(id: unknown): Promise<RuntimeRun> { return this.coordinator.get(this.runId(id)); }
  pause(id: unknown): Promise<RuntimeRun> { return this.coordinator.pause(this.runId(id)); }
  resume(id: unknown): Promise<RuntimeRun> { return this.coordinator.resume(this.runId(id)); }
  cancel(id: unknown): Promise<RuntimeRun> { return this.coordinator.cancel(this.runId(id)); }
  private runId(value: unknown): RunId { if (typeof value !== 'string' || value.trim().length === 0) throw new Error('Execution id is required'); return value as RunId; }

  private validate(run: RuntimeRun): EvaluationResult {
    const now = new Date().toISOString() as ISO8601;
    return { schemaVersion: '2.0', createdAt: now, updatedAt: now, correlationId: run.correlationId, status: 'inconclusive', checks: [], summary: 'Independent validation checks are not configured' };
  }
}

function runtimeInput(input: unknown): TaskRuntimeInput {
  if (!isRecord(input) || typeof input.objective !== 'string' || typeof input.agent !== 'object' || input.agent === null || !isRecord(input.agent) || typeof input.budget !== 'object' || input.budget === null || !isRecord(input.budget) || !Array.isArray(input.steps)) throw new Error('Runtime requires objective, agent, budget and steps');
  const agent = input.agent as unknown as AgentIdentity;
  const budget = input.budget as unknown as TokenBudget;
  if (input.objective.trim().length === 0 || typeof agent.id !== 'string' || typeof agent.name !== 'string' || typeof agent.role !== 'string') throw new Error('Runtime agent and objective are invalid');
  validateTokenBudget(budget);
  const steps = input.steps.map((step) => {
    if (!isRecord(step) || typeof step.capabilityId !== 'string' || step.capabilityId.trim().length === 0 || typeof step.estimatedTokens !== 'number' || !Number.isSafeInteger(step.estimatedTokens) || step.estimatedTokens < 0) throw new Error('Runtime step requires capabilityId and nonnegative integer estimatedTokens');
    for (const field of ['files', 'categories']) if (step[field] !== undefined && (!Array.isArray(step[field]) || !step[field].every((item: unknown) => typeof item === 'string'))) throw new Error(`Runtime ${field} must be a string array`);
    return step as unknown as RuntimePlanStep;
  });
  if (steps.length === 0) throw new Error('Runtime requires at least one capability step');
  for (const field of ['taskId', 'sprintId', 'handoffId', 'correlationId']) if (input[field] !== undefined && (typeof input[field] !== 'string' || input[field].trim().length === 0)) throw new Error(`Runtime ${field} must be a nonempty string`);
  return { objective: input.objective, agent, budget, steps, sprintId: input.sprintId as EntityId | undefined, taskId: input.taskId as EntityId | undefined, handoffId: input.handoffId as EntityId | undefined, correlationId: input.correlationId as string | undefined };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }

export async function createDefaultControlPlane(eventStream: InMemoryEventStream, registry = createDefaultCapabilityRegistry(), policy = createDefaultPolicy(), persistence?: RuntimePersistence, approvals = policy.approvals, events?: EventBus, graph?: GraphLoop, context?: ContextEngine, orchestrationStore: OrchestrationStore = new InMemoryOrchestrationStore(), observationStore: ObservationStore = new InMemoryObservationStore(), validator?: TaskRuntimeValidator): Promise<ControlPlane> {
  return (await createDefaultServerServices(eventStream, registry, policy, persistence, approvals, events, graph, context, orchestrationStore, observationStore, validator)).controlPlane;
}

export async function createDefaultServerServices(eventStream: InMemoryEventStream, registry = createDefaultCapabilityRegistry(), policy = createDefaultPolicy(), persistence?: RuntimePersistence, approvals = policy.approvals, events?: EventBus, graph?: GraphLoop, context?: ContextEngine, orchestrationStore: OrchestrationStore = new InMemoryOrchestrationStore(), observationStore: ObservationStore = new InMemoryObservationStore(), validator?: TaskRuntimeValidator, mcpAudit?: import('../../../packages/mcp/src/index.ts').McpAuditSink, planningOptions: ServerPlanningOptions = {}): Promise<{ readonly controlPlane: ControlPlane; readonly mcp: McpServer }> {
  const store = orchestrationStore;
  const sprintEngine = new SprintEngine(store);
  const taskEngine = new TaskEngine(store, sprintEngine);
  const handoffEngine = new HandoffEngine(store);
  const sharedGraph = graph ?? new GraphLoop();
  const sharedContext = context ?? new ContextEngine({ graph: new GraphContextSource({ searchContext: (objective) => sharedGraph.contextRecords(objective) }), memory: planningOptions.memory });
  const planningContext = context !== undefined && planningOptions.memory !== undefined ? new ContextEngine({ graph: new GraphContextSource({ searchContext: (objective) => sharedGraph.contextRecords(objective) }), memory: planningOptions.memory }) : sharedContext;
  const planningStore = planningOptions.store ?? new InMemoryPlanningStore({ getTask: (id) => synchronousSnapshot(store.getTask(id)), getSprint: (id) => synchronousSnapshot(store.getSprint(id)), getHandoff: (id) => synchronousSnapshot(store.getHandoff(id)) });
  const planning = new TaskPlanningService({ orchestration: store, tasks: taskEngine, context: planningContext, proposals: planningStore, policy, executor: planningOptions.executor ?? { id: 'local-server' as EntityId, name: 'Forja local server', role: 'server', autonomy: 'supervised' }, reviewer: planningOptions.reviewer });
  const runtime = new DefaultRuntimeApplication(registry, policy, store, taskEngine, persistence, sharedGraph, context, validator);
  await runtime.initialize();
  const controlPlane = new ControlPlane(new ObservabilityRecorder(observationStore), {
    planning: { propose: (input) => planning.propose(input), get: (id) => planning.get(id), review: (id, input) => planning.review(id, input) },
    runtime: { start: (input) => runtime.start(input), get: (input) => runtime.get(input), execute: (input) => runtime.execute(input), pause: (input) => runtime.pause(input), resume: (input) => runtime.resume(input), cancel: (input) => runtime.cancel(input) },
    sprint: { create: (input) => sprintEngine.create(input as Parameters<SprintEngine['create']>[0]), start: (id) => sprintEngine.start(id as EntityId), pause: (id) => sprintEngine.pause(id as EntityId) },
    task: { create: (input) => taskEngine.create(input as Parameters<TaskEngine['create']>[0]), start: (id) => taskEngine.start(id as EntityId), block: (id) => taskEngine.block(id as EntityId) },
    handoff: { create: (input) => handoffEngine.create(input as Parameters<HandoffEngine['create']>[0]) },
    approvals: { get: (id) => approvals.get(id as EntityId), list: () => approvals.list(), decide: (input) => { const value = input as { readonly id: string; readonly input: { readonly decision: 'approved' | 'rejected'; readonly approverId: EntityId; readonly decidedAt?: ISO8601 } }; return approvals.decide(value.id as EntityId, { decision: value.input.decision, approverId: value.input.approverId, decidedAt: value.input.decidedAt ?? new Date().toISOString() as ISO8601 }); } },
    events: { publish: (event) => { eventStream.publish({ id: event.id, event: event.type, data: event.data, correlationId: event.correlationId }); void events?.append({ type: event.type, aggregateId: event.aggregateId as EntityId, payload: event.data, idempotencyKey: `${event.type}:${event.id}`, correlationId: event.correlationId }); } },
  });
  const mcp = createDefaultMcp(registry, policy, sharedGraph, mcpAudit, sharedContext, { taskEngine, handoffEngine }, { propose: (input) => controlPlane.planPropose(input), get: (id) => controlPlane.planGet(id) });
  return { controlPlane, mcp };
}

function synchronousSnapshot<T>(value: T | Promise<T>): T {
  if (value instanceof Promise) {
    void value.catch(() => undefined);
    throw new PlanningError('PLANNING_SOURCE_UNSUPPORTED', 'Planning requires an atomic local snapshot store');
  }
  return value;
}

export async function bootstrap(port = Number(process.env.FORJA_PORT ?? 3000)) {
  const eventStream = new InMemoryEventStream();
  const registry = createDefaultCapabilityRegistry();
  fs.mkdirSync(getWorkspaceDbDir(), { recursive: true });
  const runtimeDatabase = new Database(process.env.FORJA_RUNTIME_DB ?? getWorkspaceDbPath());
  new SqliteMigrationRunner(runtimeDatabase).apply();
  const runtimePersistence = new SqliteRuntimePersistence(runtimeDatabase);
  const approvals = new ApprovalLedger(new SqliteApprovalStore(runtimeDatabase));
  const policy = createDefaultPolicy(approvals);
  const mcpAudit = new SqliteMcpAuditSink(runtimeDatabase);
  const events = new EventBus(new SqliteEventStore(runtimeDatabase));
  const graph = new GraphLoop(new SqliteGraphStore(runtimeDatabase));
  const orchestrationStore = new SqliteOrchestrationStore(runtimeDatabase);
  const observationStore = new SqliteObservationStore(runtimeDatabase);
  registerGraphSyncCapability(registry, graph, new GitGraphDocumentSource(process.env.FORJA_GRAPH_ROOT ?? process.cwd(), new SpawnCommandRunner()));
  const context = new ContextEngine({ graph: new GraphContextSource({ searchContext: (objective) => graph.contextRecords(objective) }), cache: new SqliteContextCache(runtimeDatabase) });
  const { mcp, controlPlane } = await createDefaultServerServices(eventStream, registry, policy, runtimePersistence, approvals, events, graph, context, orchestrationStore, observationStore, undefined, mcpAudit, { store: new SqlitePlanningStore(runtimeDatabase) });
  const authenticator = createLocalAuthenticator();
  if (authenticator === undefined) console.warn('[forja] FORJA_AUTH_TOKEN is not set — only loopback (127.0.0.1/::1) requests will be accepted. Set FORJA_AUTH_TOKEN before exposing this server beyond localhost.');
  const app = await NestFactory.create(AppModule.register({ mcp, eventStream, authenticator, controlPlane }));
  const config = new DocumentBuilder().setTitle('ForjaJS 2.0 API').setDescription('Local-first agent control plane').setVersion('2.0.0').build();
  const document = SwaggerModule.createDocument(app, config);
  document.openapi = '3.1.0';
  Object.assign(document.paths, planningOpenApiPaths());
  SwaggerModule.setup('docs', app, document);
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
