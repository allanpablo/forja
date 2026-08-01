import type { CapabilityDefinition, CapabilityId, CapabilityInput, EntityId, ExecutionResult, GraphNode, Handoff, PolicyDecision, Sprint, Task, TokenBudget } from '../../contracts/src/index.ts';
import type { CapabilityPolicy, CapabilityRegistry } from '../../core/src/index.ts';
import type { ContextBuildRequest, ContextEngine } from '../../context/src/index.ts';
import type { GraphLoop, GraphQuery } from '../../graph/src/index.ts';
import type { CreateHandoffInput, HandoffEngine, TaskEngine } from '../../orchestration/src/index.ts';

export interface McpInputSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: McpInputSchema;
}

export interface McpTextContent { readonly type: 'text'; readonly text: string; }
export interface McpToolResult { readonly isError: boolean; readonly content: readonly McpTextContent[]; readonly structuredContent: unknown; }

export interface McpPolicy {
  authorize(input: { readonly action: string; readonly category: string; readonly risk: 'low' | 'medium' | 'high' | 'critical'; readonly files: readonly string[] }): PolicyDecision;
}

export interface McpAgentContext {
  readonly id: EntityId;
  readonly name: string;
  readonly role: string;
  readonly autonomy: 'consultive' | 'assisted' | 'supervised' | 'controlled_autonomous';
  readonly permissions: readonly string[];
  readonly capabilities: readonly CapabilityId[];
}

export interface McpMemoryQuery {
  query(objective: string): unknown | Promise<unknown>;
}

export interface McpSpecChecker {
  check(input: Record<string, unknown>): unknown | Promise<unknown>;
}

export interface McpTestRunner {
  run(input: Record<string, unknown>): unknown | Promise<unknown>;
}

export interface McpExecutionValidator {
  validate(input: Record<string, unknown>): unknown | Promise<unknown>;
}

export interface McpResource {
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly mimeType: string;
  readonly read: () => unknown | Promise<unknown>;
}

export interface McpAuditEvent {
  readonly action: 'mcp.tool';
  readonly tool: string;
  readonly agentId: EntityId;
  readonly correlationId: string;
  readonly outcome: 'success' | 'failure' | 'blocked';
  readonly details: Readonly<Record<string, string>>;
}

export interface McpAuditSink {
  append(event: McpAuditEvent): void | Promise<void>;
}

export const MCP_RESOURCE_URIS = [
  'forja://workspace/current',
  'forja://project/current',
  'forja://specs',
  'forja://decisions',
  'forja://graph',
  'forja://agent/agenda',
  'forja://executions',
] as const;
export type McpResourceUri = typeof MCP_RESOURCE_URIS[number];

export interface McpServerDependencies {
  readonly registry: CapabilityRegistry;
  readonly policy: CapabilityPolicy;
  readonly agent: McpAgentContext;
  readonly context?: ContextEngine;
  readonly graph?: GraphLoop;
  readonly memory?: McpMemoryQuery;
  readonly taskEngine?: TaskEngine;
  readonly handoffEngine?: HandoffEngine;
  readonly specChecker?: McpSpecChecker;
  readonly testRunner?: McpTestRunner;
  readonly executionValidator?: McpExecutionValidator;
  readonly mcpPolicy?: McpPolicy;
  readonly resources?: readonly McpResource[];
  readonly resourceData?: Readonly<Partial<Record<McpResourceUri, unknown>>>;
  readonly audit?: McpAuditSink;
}

export class McpAdapterError extends Error {
  constructor(message: string) { super(message); this.name = 'McpAdapterError'; }
}

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  tool('forja_workspace_status', 'Retorna o estado operacional mínimo do workspace.', []),
  tool('forja_capabilities_list', 'Lista capabilities visíveis para a identidade MCP.', []),
  tool('forja_capability_describe', 'Descreve uma capability pelo Registry.', ['capabilityId']),
  tool('forja_capability_execute', 'Executa uma capability pelo Registry com Policy e resultado auditável.', ['capabilityId']),
  tool('forja_context_build', 'Constrói contexto mínimo com orçamento e evidências.', ['objective', 'budget']),
  tool('forja_memory_query', 'Consulta memória por objetivo.', ['objective']),
  tool('forja_graph_query', 'Consulta nós do GraphLoop.', []),
  tool('forja_code_impact', 'Consulta impacto de um nó no GraphLoop.', ['origin']),
  tool('forja_task_next', 'Obtém a próxima Task elegível de uma Sprint.', ['sprintId']),
  tool('forja_handoff_create', 'Cria um handoff estruturado e auditável.', ['from', 'to', 'intent', 'objective', 'acceptance', 'evidenceIds', 'nextAgent']),
  tool('forja_spec_check', 'Executa a verificação de uma spec pelo adapter configurado.', []),
  tool('forja_test_run', 'Executa testes pelo adapter configurado.', []),
  tool('forja_execution_validate', 'Valida uma execução pelo adapter configurado.', []),
];

export class McpServer {
  private readonly dependencies: McpServerDependencies;
  private readonly tools = new Map<string, McpToolDefinition>();
  private readonly resources = new Map<string, McpResource>();

  constructor(dependencies: McpServerDependencies) {
    this.dependencies = dependencies;
    for (const definition of MCP_TOOLS) this.tools.set(definition.name, definition);
    for (const definition of dependencies.registry.list({ agent: dependencies.agent, policy: dependencies.policy })) {
      const name = capabilityToolName(definition.id);
      if (!this.tools.has(name)) this.tools.set(name, capabilityTool(definition));
    }
    for (const uri of MCP_RESOURCE_URIS) this.resources.set(uri, { uri, name: uri, description: `Forja resource ${uri}`, mimeType: 'application/json', read: () => dependencies.resourceData?.[uri] ?? { available: false, uri, reason: 'Resource provider is not configured' } });
    for (const resource of dependencies.resources ?? []) this.resources.set(resource.uri, resource);
  }

  listTools(): readonly McpToolDefinition[] { return [...this.tools.values()]; }
  listResources(): readonly McpResource[] { return [...this.resources.values()]; }

  async callTool(name: string, input: unknown = {}): Promise<McpToolResult> {
    const definition = this.tools.get(name);
    if (definition === undefined) {
      const result = this.error('TOOL_NOT_FOUND', `MCP tool not found: ${name}`);
      await this.audit(name, input, 'failure', result.structuredContent);
      return result;
    }
    try {
      const object = this.objectInput(input);
      this.requireFields(definition, object);
      const value = await this.dispatch(name, object);
      const result = this.success(value);
      await this.audit(name, object, 'success');
      return result;
    } catch (error: unknown) {
      const result = this.error('TOOL_FAILED', error instanceof Error ? error.message : 'Unknown MCP tool error');
      await this.audit(name, input, 'failure', result.structuredContent);
      return result;
    }
  }

  async readResource(uri: string): Promise<McpToolResult> {
    const resource = this.resources.get(uri);
    if (resource === undefined) return this.error('RESOURCE_NOT_FOUND', `MCP resource not found: ${uri}`);
    try { return this.success(await resource.read()); } catch (error: unknown) { return this.error('RESOURCE_FAILED', error instanceof Error ? error.message : 'Unknown MCP resource error'); }
  }

  private async dispatch(name: string, input: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'forja_workspace_status': return { agent: this.dependencies.agent, capabilities: this.dependencies.registry.list({ agent: this.dependencies.agent }), resources: this.listResources().map((resource) => resource.uri) };
      case 'forja_capabilities_list': return this.dependencies.registry.list({ agent: this.dependencies.agent, policy: this.dependencies.policy });
      case 'forja_capability_describe': return this.dependencies.registry.describe(this.string(input, 'capabilityId'), { agent: this.dependencies.agent, policy: this.dependencies.policy });
      case 'forja_capability_execute': return this.executeCapability(input);
      case 'forja_context_build': return this.requireContext().build(this.contextRequest(input));
      case 'forja_memory_query': return this.requireMemory().query(this.string(input, 'objective'));
      case 'forja_graph_query': return this.requireGraph().query(this.graphQuery(input));
      case 'forja_code_impact': return this.requireGraph().impact(this.entity(input, 'origin'), this.number(input, 'depth', 2), this.direction(input));
      case 'forja_task_next': return this.requireTasks().next(this.entity(input, 'sprintId'));
      case 'forja_handoff_create': return this.createHandoff(input);
      case 'forja_spec_check': return this.requireSpecChecker().check(input);
      case 'forja_test_run': return this.requireTestRunner().run(input);
      case 'forja_execution_validate': return this.requireExecutionValidator().validate(input);
      default:
        if (name.startsWith('forja_capability_')) return this.executeDynamicCapability(name, input);
        throw new McpAdapterError(`MCP tool not implemented: ${name}`);
    }
  }

  private executeDynamicCapability(name: string, input: Record<string, unknown>): Promise<ExecutionResult> {
    const capabilityId = name.slice('forja_capability_'.length).replace(/_/g, '.');
    return this.executeCapability({ ...input, capabilityId });
  }

  private async createHandoff(input: Record<string, unknown>): Promise<Handoff> {
    this.authorize('forja_handoff_create', 'write', 'medium', []);
    return this.requireHandoffs().create({
      from: this.string(input, 'from'), to: this.string(input, 'to'), intent: this.string(input, 'intent'), objective: this.string(input, 'objective'),
      completedWork: this.strings(input, 'completedWork'), decisions: this.strings(input, 'decisions'), constraints: this.strings(input, 'constraints'), pending: this.strings(input, 'pending'), evidenceIds: this.entities(input, 'evidenceIds'), acceptance: this.strings(input, 'acceptance'), blockers: this.strings(input, 'blockers'), nextAgent: this.string(input, 'nextAgent'), correlationId: this.optionalString(input, 'correlationId'),
    });
  }

  private executeCapability(input: Record<string, unknown>): Promise<ExecutionResult> {
    const capabilityId = this.string(input, 'capabilityId') as CapabilityId;
    return this.dependencies.registry.execute({
      input: { capabilityId, payload: input.payload },
      agent: this.dependencies.agent,
      policy: this.dependencies.policy,
      correlationId: this.optionalString(input, 'correlationId'),
      projectId: this.optionalString(input, 'projectId'),
      environment: this.optionalString(input, 'environment'),
      categories: this.strings(input, 'categories'),
      files: this.strings(input, 'files'),
      budget: input.budget === undefined ? undefined : this.budget(input, 'budget'),
    });
  }

  private authorize(action: string, category: string, risk: 'low' | 'medium' | 'high' | 'critical', files: readonly string[]): void {
    const decision = this.dependencies.mcpPolicy?.authorize({ action, category, risk, files });
    if (decision?.effect === 'DENY' || decision?.effect === 'REQUIRE_APPROVAL') throw new McpAdapterError(`Policy blocked MCP action: ${decision.reason}`);
  }

  private contextRequest(input: Record<string, unknown>): ContextBuildRequest { return { objective: this.string(input, 'objective'), budget: this.budget(input, 'budget'), includeContent: input.includeContent !== false, maxItems: input.maxItems === undefined ? undefined : this.number(input, 'maxItems'), requireEvidence: input.requireEvidence !== false, correlationId: this.optionalString(input, 'correlationId') }; }
  private graphQuery(input: Record<string, unknown>): GraphQuery { return { type: this.optionalString(input, 'type'), status: this.optionalStatus(input, 'status'), labelIncludes: this.optionalString(input, 'labelIncludes') }; }
  private direction(input: Record<string, unknown>): 'outgoing' | 'incoming' | 'both' { const value = input.direction ?? 'outgoing'; if (value !== 'outgoing' && value !== 'incoming' && value !== 'both') throw new McpAdapterError('direction must be outgoing, incoming or both'); return value; }
  private budget(input: Record<string, unknown>, field: string): TokenBudget { const value = input[field]; if (!isRecord(value) || typeof value.inputTokens !== 'number' || typeof value.outputTokens !== 'number' || typeof value.totalTokens !== 'number' || typeof value.usedTokens !== 'number') throw new McpAdapterError(`${field} must be a TokenBudget`); return value as unknown as TokenBudget; }
  private objectInput(input: unknown): Record<string, unknown> { if (!isRecord(input)) throw new McpAdapterError('MCP input must be an object'); return input; }
  private requireFields(definition: McpToolDefinition, input: Record<string, unknown>): void { for (const field of definition.inputSchema.required ?? []) if (input[field] === undefined) throw new McpAdapterError(`Missing required input: ${field}`); }
  private string(input: Record<string, unknown>, field: string): string { const value = input[field]; if (typeof value !== 'string' || value.trim().length === 0) throw new McpAdapterError(`${field} must be a non-empty string`); return value; }
  private optionalString(input: Record<string, unknown>, field: string): string | undefined { const value = input[field]; return value === undefined ? undefined : this.string(input, field); }
  private strings(input: Record<string, unknown>, field: string): readonly string[] { const value = input[field] ?? []; if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new McpAdapterError(`${field} must be an array of strings`); return value; }
  private entity(input: Record<string, unknown>, field: string): EntityId { return this.string(input, field) as EntityId; }
  private entities(input: Record<string, unknown>, field: string): readonly EntityId[] { return this.strings(input, field) as readonly EntityId[]; }
  private number(input: Record<string, unknown>, field: string, fallback?: number): number { const value = input[field] ?? fallback; if (typeof value !== 'number' || !Number.isFinite(value)) throw new McpAdapterError(`${field} must be a finite number`); return value; }
  private optionalStatus(input: Record<string, unknown>, field: string): GraphQuery['status'] { const value = input[field]; if (value === undefined) return undefined; if (value !== 'verified' && value !== 'inferred' && value !== 'hypothesis' && value !== 'contradicted' && value !== 'unknown') throw new McpAdapterError(`${field} is an invalid knowledge status`); return value; }
  private requireContext(): ContextEngine { if (this.dependencies.context === undefined) throw new McpAdapterError('Context Engine is not configured'); return this.dependencies.context; }
  private requireGraph(): GraphLoop { if (this.dependencies.graph === undefined) throw new McpAdapterError('GraphLoop is not configured'); return this.dependencies.graph; }
  private requireMemory(): McpMemoryQuery { if (this.dependencies.memory === undefined) throw new McpAdapterError('Memory adapter is not configured'); return this.dependencies.memory; }
  private requireTasks(): TaskEngine { if (this.dependencies.taskEngine === undefined) throw new McpAdapterError('Task Engine is not configured'); return this.dependencies.taskEngine; }
  private requireHandoffs(): HandoffEngine { if (this.dependencies.handoffEngine === undefined) throw new McpAdapterError('Handoff Engine is not configured'); return this.dependencies.handoffEngine; }
  private requireSpecChecker(): McpSpecChecker { if (this.dependencies.specChecker === undefined) throw new McpAdapterError('Spec checker is not configured'); return this.dependencies.specChecker; }
  private requireTestRunner(): McpTestRunner { if (this.dependencies.testRunner === undefined) throw new McpAdapterError('Test runner is not configured'); return this.dependencies.testRunner; }
  private requireExecutionValidator(): McpExecutionValidator { if (this.dependencies.executionValidator === undefined) throw new McpAdapterError('Execution validator is not configured'); return this.dependencies.executionValidator; }
  private success(value: unknown): McpToolResult { return { isError: false, content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value }; }
  private error(code: string, message: string): McpToolResult { const value = { code, message }; return { isError: true, content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value }; }
  private async audit(toolName: string, input: unknown, outcome: McpAuditEvent['outcome'], error?: unknown): Promise<void> {
    if (this.dependencies.audit === undefined) return;
    const correlationId = isRecord(input) && typeof input.correlationId === 'string' ? input.correlationId : `${this.dependencies.agent.id}:${toolName}`;
    try {
      await this.dependencies.audit.append({ action: 'mcp.tool', tool: toolName, agentId: this.dependencies.agent.id, correlationId, outcome, details: error === undefined ? {} : { error: JSON.stringify(error) } });
    } catch {
      // Auditoria não pode derrubar o transporte MCP; o sink deve expor sua própria saúde.
    }
  }
}

function tool(name: string, description: string, required: readonly string[]): McpToolDefinition { return { name, description, inputSchema: { type: 'object', properties: Object.fromEntries(required.map((field) => [field, { type: field === 'budget' ? 'object' : field.endsWith('Ids') ? 'array' : 'string' }])), required, additionalProperties: false } }; }
function capabilityToolName(id: CapabilityId): string { return `forja_capability_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`; }
function capabilityTool(definition: CapabilityDefinition): McpToolDefinition { return { name: capabilityToolName(definition.id), description: `Executa ${definition.id}: ${definition.description}`, inputSchema: { type: 'object', properties: { payload: { type: 'object' }, correlationId: { type: 'string' }, files: { type: 'array' }, categories: { type: 'array' } }, additionalProperties: false } }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
