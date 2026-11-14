import { timingSafeEqual } from 'node:crypto';
import { PLANNING_PROPOSE_SCHEMA, PLANNING_REVIEW_SCHEMA, type McpServer, type McpToolResult } from '../../mcp/src/index.ts';
import { PlanningError } from '../../planner/src/proposal-store.ts';
import type { ControlPlanePort } from '../../observability/src/index.ts';

export interface HttpRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly body?: unknown;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly correlationId?: string;
  /** `req.socket.remoteAddress` (or equivalent) of the caller, when known. Used to fail closed to
   *  loopback-only access when no authenticator is configured — see `isLoopbackAddress`. */
  readonly remoteAddress?: string;
}

/**
 * True for 127.0.0.0/8 and ::1 (with the common ::ffff:-mapped IPv4 form normalized first).
 * `address === undefined` returns false — "unknown" is not "trusted" — but callers that only have
 * a real remote address for genuine network connections (never for direct in-process calls) may
 * choose to treat a missing address as trusted at the call site; this helper stays strict.
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false;
  const value = address.startsWith('::ffff:') ? address.slice(7) : address;
  return value === '127.0.0.1' || value === '::1' || value.startsWith('127.');
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly correlationId: string;
}

export interface SseEvent {
  readonly id: string;
  readonly event: string;
  readonly data: unknown;
  readonly correlationId: string;
}

export interface EventStream {
  subscribe(listener: (event: SseEvent) => void): () => void;
}

export interface LocalAuthenticator {
  authenticate(headers: Readonly<Record<string, string | undefined>>): boolean | Promise<boolean>;
}

export function createBearerAuthenticator(token: string): LocalAuthenticator {
  if (token.length === 0) throw new NestAdapterError('Bearer token is required');
  return { authenticate: (headers) => { const value = headers.authorization; if (value === undefined || !value.startsWith('Bearer ')) return false; return constantTimeEqual(value.slice(7), token); } };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left); const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export interface OpenApiDocument {
  readonly openapi: '3.1.0';
  readonly info: { readonly title: string; readonly version: string };
  readonly paths: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface NestModuleDefinition {
  readonly name: string;
  readonly routes: readonly string[];
}

export const FORJA_NEST_MODULES: readonly NestModuleDefinition[] = [
  { name: 'WorkspaceModule', routes: ['/health', '/api/workspace/status'] },
  { name: 'CapabilityModule', routes: ['/api/capabilities', '/api/capabilities/:id/execute'] },
  { name: 'RuntimeModule', routes: ['/api/executions/:id'] },
  { name: 'PlanningModule', routes: ['/api/plans', '/api/plans/:id', '/api/plans/:id/review'] },
  { name: 'GraphModule', routes: ['/api/graph/query', '/api/graph/impact'] },
  { name: 'ContextModule', routes: ['/api/context/build'] },
  { name: 'PolicyModule', routes: ['/api/policies'] },
  { name: 'SprintModule', routes: ['/api/sprints', '/api/sprints/:id/start', '/api/sprints/:id/pause'] },
  { name: 'TaskModule', routes: ['/api/tasks/next', '/api/tasks/:id/start', '/api/tasks/:id/block'] },
  { name: 'HandoffModule', routes: ['/api/handoffs'] },
  { name: 'ApprovalModule', routes: ['/api/approvals', '/api/approvals/:id', '/api/approvals/:id/decide'] },
  { name: 'EventModule', routes: ['/api/events'] },
  { name: 'AuditModule', routes: ['/api/audit', '/api/observability/observations'] },
  { name: 'ControlPlaneModule', routes: ['/api/control-plane/metrics'] },
  { name: 'McpModule', routes: ['/mcp/tools', '/mcp/resources'] },
];

export function planningOpenApiPaths(): OpenApiDocument['paths'] {
  const string = { type: 'string' };
  const strings = { type: 'array', items: string };
  const timestamp = { type: 'string', format: 'date-time' };
  const tokens = { type: 'integer', minimum: 0 };
  const tokenBudget = PLANNING_PROPOSE_SCHEMA.properties.budget;
  const knowledge = { type: 'string', enum: ['verified', 'inferred', 'hypothesis', 'contradicted', 'unknown'] };
  const evidence = { type: 'object', required: ['id', 'source', 'locator', 'capturedAt', 'status'], properties: { id: string, source: string, locator: string, capturedAt: timestamp, status: knowledge, checksum: string } };
  const evidenceItems = { type: 'array', items: evidence };
  const contextItem = { type: 'object', required: ['id', 'source', 'locator', 'checksum', 'status', 'evidence'], properties: { id: string, source: { enum: ['memory', 'graph'] }, locator: string, content: string, checksum: string, status: knowledge, evidence: evidenceItems } };
  const task = { type: 'object', required: ['id', 'sprintId', 'objective', 'acceptanceCriteria', 'allowedFiles', 'dependencyIds', 'budget', 'status'], properties: { id: string, sprintId: string, objective: string, acceptanceCriteria: strings, allowedFiles: strings, dependencyIds: strings, evidenceIds: strings, budget: tokenBudget, status: string } };
  const step = { type: 'object', required: ['id', 'objective', 'acceptanceCriteria', 'allowedFiles', 'dependencyIds', 'evidenceIds', 'budget', 'status'], properties: { id: string, objective: string, acceptanceCriteria: strings, allowedFiles: strings, dependencyIds: strings, externalDependencyIds: strings, contextItemId: string, rationale: string, constraints: strings, evidenceIds: strings, risk: string, budget: tokenBudget, status: string } };
  const proposal = {
    type: 'object', required: ['id', 'version', 'digest', 'status', 'snapshot', 'budget', 'blockers'],
    properties: {
      id: string, version: { const: 1 }, digest: string, status: { type: 'string', enum: ['draft', 'blocked', 'approved', 'rejected'] },
      schemaVersion: string, createdAt: timestamp, updatedAt: timestamp, correlationId: string, declaredEvidenceIds: strings,
      executor: { type: 'object', required: ['id', 'name', 'role', 'autonomy'], properties: { id: string, name: string, role: string, autonomy: string } },
      snapshot: { type: 'object', required: ['task', 'sprint', 'dependencies'], properties: {
        task, dependencies: { type: 'array', items: task },
        sprint: { type: 'object', properties: { id: string, objective: string, status: string, budget: tokenBudget, includedScope: strings, excludedScope: strings, completionCriteria: strings, taskIds: strings } },
        handoff: { type: 'object', properties: { id: string, taskId: string, from: string, to: string, nextAgent: string, intent: string, objective: string, completedWork: strings, decisions: strings, constraints: strings, pending: strings, acceptance: strings, blockers: strings, evidenceIds: strings, status: string } },
      } },
      plan: { type: 'object', properties: { id: string, objective: string, steps: { type: 'array', items: step }, budget: tokenBudget, constraints: strings, decisions: strings, evidenceIds: strings } },
      context: { type: 'object', properties: { id: string, checksum: string, references: evidenceItems, content: strings, items: { type: 'array', items: contextItem }, budget: tokenBudget } },
      budget: { type: 'object', description: 'Conservative token estimates, not billed usage', required: ['limit', 'briefingTokens', 'contextTokens', 'allocation'], properties: { limit: tokenBudget, briefingTokens: tokens, contextTokens: tokens, allocation: tokenBudget } },
      blockers: { type: 'array', items: { type: 'object', required: ['code', 'message'], properties: { code: string, message: string } } },
      review: { type: 'object', required: ['decision', 'reviewerId', 'reason', 'digest', 'decidedAt'], properties: { decision: { enum: ['approved', 'rejected'] }, reviewerId: string, reason: string, digest: string, decidedAt: timestamp, sourcesVerifiedAt: timestamp } },
    },
  };
  const responses = { '200': { description: 'Persisted planning proposal; never an execution', content: { 'application/json': { schema: proposal } } }, ...Object.fromEntries([400, 401, 403, 404, 409, 500, 503].map((status) => [String(status), { description: 'Planning error', content: { 'application/json': { schema: { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' } } } } } } } }])) };
  const parameters = [{ name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 1 } }];
  return {
    '/api/plans': { post: { operationId: 'planPropose', requestBody: { required: true, content: { 'application/json': { schema: PLANNING_PROPOSE_SCHEMA } } }, responses } },
    '/api/plans/{id}': { get: { operationId: 'planGet', parameters, responses } },
    '/api/plans/{id}/review': { post: { operationId: 'planReview', parameters, requestBody: { required: true, content: { 'application/json': { schema: PLANNING_REVIEW_SCHEMA } } }, responses } },
  };
}

export class NestAdapterError extends Error {
  constructor(message: string) { super(message); this.name = 'NestAdapterError'; }
}

export class ForjaNestAdapter {
  private readonly mcp: McpServer;
  private readonly stream?: EventStream;
  private readonly authenticator?: LocalAuthenticator;
  private readonly controlPlane?: ControlPlanePort;

  constructor(mcp: McpServer, stream?: EventStream, authenticator?: LocalAuthenticator, controlPlane?: ControlPlanePort) { this.mcp = mcp; this.stream = stream; this.authenticator = authenticator; this.controlPlane = controlPlane; }

  async handle(request: HttpRequest): Promise<HttpResponse> {
    const correlationId = request.correlationId ?? request.headers['x-correlation-id'] ?? `http:${request.method}:${request.path}`;
    try {
      if (!(await this.isAuthenticated(request))) return { status: 401, headers: { 'content-type': 'application/json; charset=utf-8', 'x-correlation-id': correlationId, 'www-authenticate': 'Bearer' }, body: { error: { code: 'UNAUTHENTICATED', message: 'Local authentication required' } }, correlationId };
      const result = await this.dispatch(request);
      return this.result(correlationId, result);
    } catch (error: unknown) {
      if (request.path === '/api/plans' || request.path.startsWith('/api/plans/')) {
        const status = error instanceof PlanningError ? ({ PLANNING_INVALID_INPUT: 400, PLANNING_NOT_FOUND: 404, PLANNING_DENIED: 403, PLANNING_CONFLICT: 409, PLANNING_STALE: 409, PLANNING_INVALID_SCOPE: 409, PLANNING_INVALID_REVIEW: 409, PLANNING_REVIEWER_UNAVAILABLE: 503 } as Readonly<Record<string, number>>)[error.code] ?? 500 : 500;
        return { status, headers: { 'content-type': 'application/json; charset=utf-8', 'x-correlation-id': correlationId }, body: { error: { code: status === 500 ? 'PLANNING_UNAVAILABLE' : (error as PlanningError).code, message: status === 500 ? 'Planning service unavailable' : (error as PlanningError).message } }, correlationId };
      }
      return this.error(correlationId, error instanceof Error ? error.message : 'Unknown HTTP adapter error');
    }
  }

  /**
   * Fails closed when no authenticator is configured: previously this meant "allow everyone", which
   * left any request that reached the process (e.g. a container-network or port-forward hop) fully
   * unauthenticated. Now it means "loopback callers only". `remoteAddress` being unset (rather than
   * a real non-loopback address) is treated as an internal/direct call — e.g. dispatched in-process,
   * not received over an actual socket — and stays trusted; a genuine HTTP layer always supplies it
   * (see ForjaLocalAuthGuard, which reads it straight off the raw socket).
   */
  private async isAuthenticated(request: HttpRequest): Promise<boolean> {
    if (this.authenticator === undefined) return request.remoteAddress === undefined || isLoopbackAddress(request.remoteAddress);
    return this.authenticator.authenticate(request.headers);
  }

  subscribeSse(listener: (event: SseEvent) => void): () => void {
    if (this.stream === undefined) throw new NestAdapterError('Event stream is not configured');
    return this.stream.subscribe(listener);
  }

  modules(): readonly NestModuleDefinition[] { return FORJA_NEST_MODULES; }
  openApi(): OpenApiDocument {
    const paths = { ...Object.fromEntries(FORJA_NEST_MODULES.filter((module) => module.name !== 'PlanningModule').flatMap((module) => module.routes.map((route) => [route, { description: `${module.name} route` }]))), ...planningOpenApiPaths() };
    return { openapi: '3.1.0', info: { title: 'ForjaJS 2.0 API', version: '2.0.0' }, paths };
  }

  private async dispatch(request: HttpRequest): Promise<unknown> {
    if (request.method === 'POST' && request.path === '/api/plans') {
      if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body)) throw new PlanningError('PLANNING_INVALID_INPUT', 'Planning body must be an object');
      const body = request.body as Record<string, unknown>;
      return this.requireControlPlane().planPropose?.({ ...body, correlationId: request.correlationId ?? request.headers['x-correlation-id'] ?? body.correlationId }) ?? this.missing('planPropose');
    }
    const planRoute = /^\/api\/plans\/([^/]+)(\/review)?$/.exec(request.path);
    if (planRoute !== null && request.method === 'GET' && planRoute[2] === undefined) return this.requireControlPlane().planGet?.(planRoute[1]) ?? this.missing('planGet');
    if (planRoute !== null && request.method === 'POST' && planRoute[2] !== undefined) return this.requireControlPlane().planReview?.(planRoute[1], request.body) ?? this.missing('planReview');
    if (request.path === '/api/plans' || request.path.startsWith('/api/plans/')) throw new PlanningError('PLANNING_NOT_FOUND', 'Planning route not found');
    if (request.method === 'GET' && request.path === '/health') return { status: 'ok', service: 'forja-server', offline: true };
    if (request.method === 'GET' && request.path === '/api/workspace/status') return this.call('forja_workspace_status', {});
    if (request.method === 'GET' && request.path === '/api/capabilities') return this.call('forja_capabilities_list', {});
    if (request.method === 'POST' && request.path.startsWith('/api/capabilities/') && request.path.endsWith('/execute')) return this.call('forja_capability_execute', { ...(this.objectBody(request.body)), capabilityId: this.pathCapabilityId(request.path) });
    if (request.method === 'POST' && request.path === '/api/context/build') return this.call('forja_context_build', request.body ?? {});
    if (request.method === 'GET' && request.path === '/api/graph/query') return this.call('forja_graph_query', request.query);
    if (request.method === 'GET' && request.path === '/api/graph/impact') return this.call('forja_code_impact', request.query);
    if (request.method === 'GET' && request.path === '/api/tasks/next') return this.call('forja_task_next', request.query);
    if (request.method === 'POST' && request.path === '/api/handoffs') return this.call('forja_handoff_create', request.body ?? {});
    if (request.method === 'POST' && request.path === '/api/executions') return this.requireControlPlane().runtimeStart?.(request.body ?? {}) ?? this.missing('runtimeStart');
    if (request.method === 'GET' && request.path.startsWith('/api/executions/')) return this.requireControlPlane().runtimeGet?.(this.idFromPath(request.path, '/api/executions/')) ?? this.missing('runtimeGet');
    if (request.method === 'POST' && request.path.endsWith('/execute') && request.path.startsWith('/api/executions/')) return this.requireControlPlane().runtimeExecute?.(this.idFromPath(request.path, '/api/executions/')) ?? this.missing('runtimeExecute');
    if (request.method === 'POST' && request.path.endsWith('/pause') && request.path.startsWith('/api/executions/')) return this.requireControlPlane().runtimePause?.(this.idFromPath(request.path, '/api/executions/')) ?? this.missing('runtimePause');
    if (request.method === 'POST' && request.path.endsWith('/resume') && request.path.startsWith('/api/executions/')) return this.requireControlPlane().runtimeResume?.(this.idFromPath(request.path, '/api/executions/')) ?? this.missing('runtimeResume');
    if (request.method === 'POST' && request.path.endsWith('/cancel') && request.path.startsWith('/api/executions/')) return this.requireControlPlane().runtimeCancel?.(this.idFromPath(request.path, '/api/executions/')) ?? this.missing('runtimeCancel');
    if (request.method === 'POST' && request.path === '/api/sprints') return this.requireControlPlane().sprintCreate?.(request.body ?? {}) ?? this.missing('sprintCreate');
    if (request.method === 'POST' && request.path.endsWith('/start') && request.path.startsWith('/api/sprints/')) return this.requireControlPlane().sprintStart?.(this.idFromPath(request.path, '/api/sprints/')) ?? this.missing('sprintStart');
    if (request.method === 'POST' && request.path.endsWith('/pause') && request.path.startsWith('/api/sprints/')) return this.requireControlPlane().sprintPause?.(this.idFromPath(request.path, '/api/sprints/')) ?? this.missing('sprintPause');
    if (request.method === 'POST' && request.path === '/api/tasks') return this.requireControlPlane().taskCreate?.(request.body ?? {}) ?? this.missing('taskCreate');
    if (request.method === 'POST' && request.path.endsWith('/start') && request.path.startsWith('/api/tasks/')) return this.requireControlPlane().taskStart?.(this.idFromPath(request.path, '/api/tasks/')) ?? this.missing('taskStart');
    if (request.method === 'POST' && request.path.endsWith('/block') && request.path.startsWith('/api/tasks/')) return this.requireControlPlane().taskBlock?.(this.idFromPath(request.path, '/api/tasks/')) ?? this.missing('taskBlock');
    if (request.method === 'GET' && request.path.startsWith('/api/approvals/')) return this.requireControlPlane().approvalGet?.(this.idFromPath(request.path, '/api/approvals/')) ?? this.missing('approvalGet');
    if (request.method === 'GET' && request.path === '/api/approvals') return this.requireControlPlane().approvalList?.() ?? this.missing('approvalList');
    if (request.method === 'POST' && request.path.endsWith('/decide') && request.path.startsWith('/api/approvals/')) return this.requireControlPlane().approvalDecide?.(this.idFromPath(request.path, '/api/approvals/'), request.body ?? {}) ?? this.missing('approvalDecide');
    if (request.method === 'GET' && request.path === '/api/control-plane/metrics') return this.requireControlPlane().metrics();
    if (request.method === 'GET' && request.path === '/api/observability/observations') return this.requireControlPlane().observations();
    if (request.method === 'GET' && request.path === '/mcp/tools') return this.mcp.listTools();
    if (request.method === 'GET' && request.path === '/mcp/resources') return this.mcp.listResources();
    if (request.method === 'GET' && request.path.startsWith('/mcp/resources/')) return this.mcp.readResource(request.path.slice('/mcp/resources/'.length));
    throw new NestAdapterError(`Route not found: ${request.method} ${request.path}`);
  }

  private async call(tool: string, input: unknown): Promise<unknown> { const result = await this.mcp.callTool(tool, input); if (result.isError) throw new NestAdapterError(this.errorMessage(result)); return result.structuredContent; }
  private result(correlationId: string, body: unknown): HttpResponse { return { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'x-correlation-id': correlationId }, body, correlationId }; }
  private error(correlationId: string, message: string): HttpResponse { return { status: message.startsWith('Route not found') ? 404 : 400, headers: { 'content-type': 'application/json; charset=utf-8', 'x-correlation-id': correlationId }, body: { error: { code: message.startsWith('Route not found') ? 'NOT_FOUND' : 'BAD_REQUEST', message } }, correlationId }; }
  private objectBody(value: unknown): Record<string, unknown> { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new NestAdapterError('Request body must be an object'); return value as Record<string, unknown>; }
  private pathCapabilityId(path: string): string { const prefix = '/api/capabilities/'; const value = path.slice(prefix.length, -'/execute'.length); if (value.trim().length === 0 || value.includes('/')) throw new NestAdapterError('Capability id is required'); return value; }
  private errorMessage(result: McpToolResult): string { const value = result.structuredContent; if (typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string') return value.message; return 'MCP operation failed'; }
  private requireControlPlane(): ControlPlanePort { if (this.controlPlane === undefined) throw new NestAdapterError('Control Plane is not configured'); return this.controlPlane; }
  private idFromPath(path: string, prefix: string): string { const value = path.slice(prefix.length).split('/')[0]; if (value.trim().length === 0) throw new NestAdapterError('Resource id is required'); return value; }
  private missing(name: string): never { throw new NestAdapterError(`Control Plane service is not configured: ${name}`); }
}

export class InMemoryEventStream implements EventStream {
  private readonly listeners = new Set<(event: SseEvent) => void>();
  subscribe(listener: (event: SseEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  publish(event: SseEvent): void { for (const listener of this.listeners) listener(event); }
}
