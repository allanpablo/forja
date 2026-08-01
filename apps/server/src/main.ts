import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CapabilityRegistry } from '../../../packages/core/src/index.ts';
import { PolicyEngine, type PolicyRule } from '../../../packages/policy/src/index.ts';
import { McpServer } from '../../../packages/mcp/src/index.ts';
import { ControlPlane } from '../../../packages/observability/src/index.ts';
import { ApprovalLedger } from '../../../packages/policy/src/index.ts';
import { HandoffEngine, InMemoryOrchestrationStore, SprintEngine, TaskEngine } from '../../../packages/orchestration/src/index.ts';
import { validateTokenBudget, type EntityId, type ISO8601 } from '../../../packages/contracts/src/index.ts';
import { createBearerAuthenticator, InMemoryEventStream, type LocalAuthenticator } from '../../../packages/adapter-nest/src/index.ts';
import { AppModule } from './app.module.ts';
import { RuntimeEngine, type RuntimePlanStep } from '../../../packages/runtime/src/index.ts';
import { GraphLoop } from '../../../packages/graph/src/index.ts';
import type { AgentIdentity, EvaluationResult, ExecutionResult, TokenBudget } from '../../../packages/contracts/src/index.ts';

export function createDefaultMcp(registry = new CapabilityRegistry(), policy = createDefaultPolicy(), graph = new GraphLoop()): McpServer {
  return new McpServer({ registry, policy, graph, agent: { id: 'local-server' as EntityId, name: 'Forja local server', role: 'server', autonomy: 'supervised', permissions: [], capabilities: [] } });
}

export function createDefaultPolicy(): PolicyEngine {
  const readOnlyRule: PolicyRule = { id: 'local-read-only', priority: 10, effect: 'ALLOW', reason: 'Default local server permits read capabilities only', scope: { categories: ['read'], environments: ['local'] } };
  return new PolicyEngine({ rules: [readOnlyRule] });
}

export function createLocalAuthenticator(token = process.env.FORJA_AUTH_TOKEN): LocalAuthenticator | undefined {
  if (token === undefined || token.length === 0) return undefined;
  return createBearerAuthenticator(token);
}

interface RuntimeRequestContext { readonly steps: readonly RuntimePlanStep[]; }

class DefaultRuntimeApplication {
  private readonly contexts = new Map<string, RuntimeRequestContext>();
  private readonly runtime: RuntimeEngine;
  private readonly policy: PolicyEngine;

  constructor(registry: CapabilityRegistry, policy: PolicyEngine) {
    this.policy = policy;
    this.runtime = new RuntimeEngine({
      registry,
      planner: { plan: (_objective, context) => { if (!isRecord(context) || !Array.isArray(context.steps)) throw new Error('Runtime plan context is missing'); return context.steps as readonly RuntimePlanStep[]; } },
      contextBuilder: { build: async (objective) => this.contexts.get(objective) },
      validator: { validate: (run, results) => this.validate(run, results) },
    });
  }

  async start(input: unknown): Promise<unknown> {
    const value = runtimeInput(input);
    this.contexts.set(value.objective, { steps: value.steps });
    try { return await this.runtime.start({ objective: value.objective, agent: value.agent, budget: value.budget, policy: this.policy, sprintId: value.sprintId, taskId: value.taskId, correlationId: value.correlationId }); }
    finally { this.contexts.delete(value.objective); }
  }
  execute(id: unknown): Promise<unknown> { return this.runtime.execute(id as never); }
  get(id: unknown): unknown { return this.runtime.get(id as never); }
  pause(id: unknown): unknown { return this.runtime.pause(id as never); }
  resume(id: unknown): Promise<unknown> { return this.runtime.resume(id as never); }
  cancel(id: unknown): Promise<unknown> { return this.runtime.cancel(id as never); }

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

export function createDefaultControlPlane(eventStream: InMemoryEventStream, registry = new CapabilityRegistry(), policy = createDefaultPolicy()): ControlPlane {
  const store = new InMemoryOrchestrationStore();
  const sprintEngine = new SprintEngine(store);
  const taskEngine = new TaskEngine(store, sprintEngine);
  const handoffEngine = new HandoffEngine(store);
  const approvals = new ApprovalLedger();
  const runtime = new DefaultRuntimeApplication(registry, policy);
  return new ControlPlane(undefined, {
    runtime: { start: (input) => runtime.start(input), get: (input) => runtime.get(input), execute: (input) => runtime.execute(input), pause: (input) => runtime.pause(input), resume: (input) => runtime.resume(input), cancel: (input) => runtime.cancel(input) },
    sprint: { create: (input) => sprintEngine.create(input as Parameters<SprintEngine['create']>[0]), start: (id) => sprintEngine.start(id as EntityId), pause: (id) => sprintEngine.pause(id as EntityId) },
    task: { create: (input) => taskEngine.create(input as Parameters<TaskEngine['create']>[0]), start: (id) => taskEngine.start(id as EntityId), block: (id) => taskEngine.block(id as EntityId) },
    handoff: { create: (input) => handoffEngine.create(input as Parameters<HandoffEngine['create']>[0]) },
    approvals: { get: (id) => approvals.get(id as EntityId), list: () => approvals.list(), decide: (input) => { const value = input as { readonly id: string; readonly input: { readonly decision: 'approved' | 'rejected'; readonly approverId: EntityId; readonly decidedAt?: ISO8601 } }; return approvals.decide(value.id as EntityId, { decision: value.input.decision, approverId: value.input.approverId, decidedAt: value.input.decidedAt ?? new Date().toISOString() as ISO8601 }); } },
    events: { publish: (event) => eventStream.publish({ id: event.id, event: event.type, data: event.data, correlationId: event.correlationId }) },
  });
}

export async function bootstrap(port = Number(process.env.FORJA_PORT ?? 3000)) {
  const eventStream = new InMemoryEventStream();
  const registry = new CapabilityRegistry();
  const policy = createDefaultPolicy();
  const mcp = createDefaultMcp(registry, policy, new GraphLoop());
  const app = await NestFactory.create(AppModule.register({ mcp, eventStream, authenticator: createLocalAuthenticator(), controlPlane: createDefaultControlPlane(eventStream, registry, policy) }));
  const config = new DocumentBuilder().setTitle('ForjaJS 2.0 API').setDescription('Local-first agent control plane').setVersion('2.0.0').build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(port, '127.0.0.1');
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) void bootstrap();
