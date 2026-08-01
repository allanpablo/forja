import type { AgentIdentity, ApprovalRequest, CapabilityDefinition, CapabilityId, ContextPackage, EntityId, ExecutionResult, Handoff, RuntimeRun, Sprint, Task, TokenBudget } from '../../contracts/src/index.ts';
import type { GraphQuery } from '../../graph/src/index.ts';

export interface SdkRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface SdkResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

export interface SdkTransport {
  request(input: SdkRequest): SdkResponse | Promise<SdkResponse>;
  subscribe?(listener: (event: SdkEvent) => void): () => void;
}

export interface SdkEvent {
  readonly id: string;
  readonly type: string;
  readonly data: unknown;
  readonly correlationId?: string;
}

export interface ExecuteCapabilityOptions {
  readonly categories?: readonly string[];
  readonly files?: readonly string[];
  readonly budget?: TokenBudget;
  readonly projectId?: string;
  readonly environment?: string;
  readonly correlationId?: string;
}

export interface CreateSprintRequest {
  readonly objective: string;
  readonly includedScope: readonly string[];
  readonly excludedScope: readonly string[];
  readonly budget: TokenBudget;
  readonly completionCriteria: readonly string[];
  readonly risks: readonly string[];
  readonly evidenceIds: readonly EntityId[];
  readonly correlationId?: string;
}

export interface CreateTaskRequest {
  readonly sprintId: EntityId;
  readonly objective: string;
  readonly acceptanceCriteria: readonly string[];
  readonly allowedFiles: readonly string[];
  readonly dependencyIds: readonly EntityId[];
  readonly evidenceIds: readonly EntityId[];
  readonly budget: TokenBudget;
  readonly correlationId?: string;
}

export interface CreateHandoffRequest {
  readonly from: string;
  readonly to: string;
  readonly intent: string;
  readonly objective: string;
  readonly completedWork: readonly string[];
  readonly decisions: readonly string[];
  readonly constraints: readonly string[];
  readonly pending: readonly string[];
  readonly evidenceIds: readonly EntityId[];
  readonly acceptance: readonly string[];
  readonly blockers: readonly string[];
  readonly nextAgent: string;
  readonly correlationId?: string;
}

export interface StartRuntimeRequest {
  readonly objective: string;
  readonly agent: AgentIdentity;
  readonly budget: TokenBudget;
  readonly steps: readonly { readonly capabilityId: CapabilityId; readonly payload: unknown; readonly estimatedTokens: number; readonly files?: readonly string[]; readonly categories?: readonly string[]; readonly environment?: string }[];
  readonly sprintId?: EntityId;
  readonly taskId?: EntityId;
  readonly correlationId?: string;
}

export class SdkError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) { super(message); this.name = 'SdkError'; this.status = status; this.body = body; }
}

export class ForjaSdk {
  private readonly transport: SdkTransport;
  private readonly defaultHeaders: Readonly<Record<string, string>>;

  constructor(transport: SdkTransport, options: { readonly token?: string; readonly correlationId?: string } = {}) {
    this.transport = transport;
    this.defaultHeaders = { ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }), ...(options.correlationId === undefined ? {} : { 'x-correlation-id': options.correlationId }) };
  }

  workspaceStatus(): Promise<unknown> { return this.get('/api/workspace/status'); }
  listCapabilities(): Promise<readonly CapabilityDefinition[]> { return this.get('/api/capabilities') as Promise<readonly CapabilityDefinition[]>; }
  executeCapability(capabilityId: CapabilityId, payload: unknown, options: ExecuteCapabilityOptions = {}): Promise<ExecutionResult> { return this.post(`/api/capabilities/${encodeURIComponent(capabilityId)}/execute`, { payload, categories: options.categories ?? [], files: options.files ?? [], ...(options.budget === undefined ? {} : { budget: options.budget }), ...(options.projectId === undefined ? {} : { projectId: options.projectId }), ...(options.environment === undefined ? {} : { environment: options.environment }), ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }) }) as Promise<ExecutionResult>; }
  buildContext(input: { readonly objective: string; readonly budget: TokenBudget; readonly includeContent?: boolean; readonly maxItems?: number }): Promise<ContextPackage> { return this.post('/api/context/build', input) as Promise<ContextPackage>; }
  graphQuery(query: GraphQuery = {}): Promise<readonly unknown[]> { return this.get('/api/graph/query', { type: query.type, status: query.status, labelIncludes: query.labelIncludes, at: query.at }) as Promise<readonly unknown[]>; }
  graphImpact(origin: EntityId, depth = 2, direction: 'outgoing' | 'incoming' | 'both' = 'outgoing'): Promise<unknown> { return this.get('/api/graph/impact', { origin, depth, direction }); }
  nextTask(sprintId: EntityId): Promise<Task | undefined> { return this.get('/api/tasks/next', { sprintId }) as Promise<Task | undefined>; }
  createSprint(input: CreateSprintRequest): Promise<Sprint> { return this.post('/api/sprints', input) as Promise<Sprint>; }
  createTask(input: CreateTaskRequest): Promise<Task> { return this.post('/api/tasks', input) as Promise<Task>; }
  createHandoff(input: CreateHandoffRequest): Promise<Handoff> { return this.post('/api/handoffs', input) as Promise<Handoff>; }
  startRuntime(input: StartRuntimeRequest): Promise<RuntimeRun> { return this.post('/api/executions', input) as Promise<RuntimeRun>; }
  getRuntime(runId: string): Promise<RuntimeRun> { return this.get(`/api/executions/${encodeURIComponent(runId)}`) as Promise<RuntimeRun>; }
  approve(requestId: EntityId, decision: { readonly decision: 'approved' | 'rejected'; readonly approverId: EntityId }): Promise<ApprovalRequest> { return this.post(`/api/approvals/${encodeURIComponent(requestId)}/decide`, decision) as Promise<ApprovalRequest>; }
  metrics(): Promise<unknown> { return this.get('/api/control-plane/metrics'); }

  subscribeEvents(listener: (event: SdkEvent) => void): () => void {
    if (this.transport.subscribe === undefined) throw new SdkError('SDK transport does not support events', 0, undefined);
    return this.transport.subscribe(listener);
  }

  private async get(path: string, query?: Readonly<Record<string, string | number | undefined>>): Promise<unknown> { return this.request({ method: 'GET', path, query }); }
  private async post(path: string, body: unknown): Promise<unknown> { return this.request({ method: 'POST', path, body }); }
  private async request(input: SdkRequest): Promise<unknown> {
    const response = await this.transport.request({ ...input, headers: { ...this.defaultHeaders, ...input.headers } });
    if (response.status < 200 || response.status >= 300) throw new SdkError(`Forja API request failed: ${input.method} ${input.path}`, response.status, response.body);
    return response.body;
  }
}
