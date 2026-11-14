import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistry } from '../packages/core/src/index.ts';
import { McpServer } from '../packages/mcp/src/index.ts';
import { ForjaNestAdapter, InMemoryEventStream, isLoopbackAddress, planningOpenApiPaths } from '../packages/adapter-nest/src/index.ts';
import { PlanningError } from '../packages/planner/src/proposal-store.ts';
import { createForjaServer } from '../apps/server/src/index.ts';
import { ControlPlane } from '../packages/observability/src/index.ts';

const agent = { id: 'agent-http', name: 'HTTP agent', role: 'developer', autonomy: 'supervised', permissions: ['read'], capabilities: [] };
const policy = { authorize: () => ({ effect: 'ALLOW', reason: 'test', policyId: 'test' }), canDiscover: () => true };
const definition = { schemaVersion: '2.0', createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z', correlationId: 'http-test', id: 'forja.http.test', version: '1.0.0', description: 'http capability', permissions: ['read'], risk: 'low', sideEffects: [], requirements: [], supportsAutonomy: true, idempotent: true, timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [] };

function adapter() {
  const registry = new CapabilityRegistry();
  registry.register({ definition, validateInput: (input) => input, validateOutput: (output) => output, handler: async (input) => ({ capabilityId: definition.id, payload: input, evidence: [] }) });
  const mcp = new McpServer({ registry, policy, agent });
  return { adapter: new ForjaNestAdapter(mcp, undefined, undefined, new ControlPlane()), stream: new InMemoryEventStream(), mcp };
}

const planningRoutes = [
  { method: 'POST', path: '/api/plans', body: { taskId: 'task-1' } },
  { method: 'GET', path: '/api/plans/plan-1' },
  { method: 'POST', path: '/api/plans/plan-1/review', body: { decision: 'approved', expectedDigest: 'digest-1', reason: 'checked' } },
];

function planningAdapter(planning, authenticator) {
  return new ForjaNestAdapter(adapter().mcp, undefined, authenticator, new ControlPlane(undefined, { planning }));
}

test('adapter-nest: planning delega proposta, consulta e review sem passar pelo MCP', async () => {
  const calls = [];
  const proposal = { id: 'plan-1', status: 'draft', digest: 'digest-1' };
  const reviewed = { ...proposal, status: 'approved' };
  const http = planningAdapter({
    propose: async (input) => { calls.push(['propose', input]); return proposal; },
    get: async (id) => { calls.push(['get', id]); return proposal; },
    review: async (id, input) => { calls.push(['review', id, input]); return reviewed; },
  });
  for (const [index, route] of planningRoutes.entries()) {
    const result = await http.handle({ ...route, query: {}, headers: { 'x-correlation-id': 'planning-corr' } });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, index === 2 ? reviewed : proposal);
    assert.equal(result.correlationId, 'planning-corr');
    assert.equal(result.headers['x-correlation-id'], 'planning-corr');
    assert.equal(result.headers['content-type'], 'application/json; charset=utf-8');
  }
  assert.deepEqual(calls, [
    ['propose', { taskId: 'task-1', correlationId: 'planning-corr' }],
    ['get', 'plan-1'],
    ['review', 'plan-1', planningRoutes[2].body],
  ]);
});

test('adapter-nest: proposta preserva payload e prioriza correlation id do transporte', async () => {
  const inputs = [];
  const http = planningAdapter({ propose: (input) => { inputs.push(input); return { id: 'plan-1' }; } });
  const body = { taskId: 'task-1', handoffId: 'handoff-1', correlationId: 'body-corr', budget: { inputTokens: 20, outputTokens: 10, totalTokens: 30, usedTokens: 0 } };
  for (const [correlationId, headers, expected, responseCorrelation] of [
    ['request-corr', { 'x-correlation-id': 'header-corr' }, 'request-corr', 'request-corr'],
    [undefined, { 'x-correlation-id': 'header-corr' }, 'header-corr', 'header-corr'],
    [undefined, {}, 'body-corr', 'http:POST:/api/plans'],
  ]) {
    const result = await http.handle({ method: 'POST', path: '/api/plans', query: {}, headers, correlationId, body });
    assert.equal(result.status, 200);
    assert.equal(result.correlationId, responseCorrelation);
    assert.equal(result.headers['x-correlation-id'], responseCorrelation);
    assert.deepEqual(inputs.at(-1), { ...body, correlationId: expected });
    assert.equal(body.correlationId, 'body-corr');
  }
});

test('adapter-nest: planning exige provider e Control Plane configurados', async () => {
  for (const controlPlane of [undefined, {}, new ControlPlane()]) {
    const http = new ForjaNestAdapter(adapter().mcp, undefined, undefined, controlPlane);
    for (const route of planningRoutes) {
      const result = await http.handle({ ...route, query: {}, headers: {}, correlationId: 'missing-corr' });
      assert.equal(result.status, 500, route.path);
      assert.deepEqual(result.body, { error: { code: 'PLANNING_UNAVAILABLE', message: 'Planning service unavailable' } });
      assert.equal(result.correlationId, 'missing-corr');
      assert.equal(result.headers['x-correlation-id'], 'missing-corr');
    }
  }
});

for (const [code, status] of [
  ['PLANNING_INVALID_INPUT', 400], ['PLANNING_NOT_FOUND', 404], ['PLANNING_DENIED', 403],
  ['PLANNING_CONFLICT', 409], ['PLANNING_STALE', 409], ['PLANNING_INVALID_SCOPE', 409],
  ['PLANNING_INVALID_REVIEW', 409], ['PLANNING_REVIEWER_UNAVAILABLE', 503],
  ['UNKNOWN_PLANNING_CODE', 500], [undefined, 500],
]) {
  test(`adapter-nest: planning mapeia ${code ?? 'erro inesperado'} para ${status}`, async () => {
    const failure = async () => { throw code === undefined ? new Error('private provider detail') : new PlanningError(code, 'private provider detail'); };
    const http = planningAdapter({ propose: failure, get: failure, review: failure });
    for (const route of planningRoutes) {
      const result = await http.handle({ ...route, query: {}, headers: { 'x-correlation-id': 'error-corr' } });
      assert.equal(result.status, status, route.path);
      assert.equal(result.body.error.code, status === 500 ? 'PLANNING_UNAVAILABLE' : code);
      assert.equal(result.correlationId, 'error-corr');
      assert.equal(result.headers['x-correlation-id'], 'error-corr');
      assert.equal(result.headers['content-type'], 'application/json; charset=utf-8');
      if (status === 500) assert.deepEqual(result.body, { error: { code: 'PLANNING_UNAVAILABLE', message: 'Planning service unavailable' } });
    }
  });
}

test('adapter-nest: planning rejeita corpos não-objeto e rotas ou métodos inválidos antes do provider', async () => {
  const calls = [];
  const unexpected = (...args) => { calls.push(args); return {}; };
  const http = planningAdapter({ propose: unexpected, get: unexpected, review: unexpected });
  for (const body of [undefined, null, [], 'task-1', 1, false]) {
    const result = await http.handle({ method: 'POST', path: '/api/plans', query: {}, headers: {}, body });
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, 'PLANNING_INVALID_INPUT');
  }
  for (const [method, path] of [
    ['GET', '/api/plans'], ['POST', '/api/plans/plan-1'], ['GET', '/api/plans/plan-1/review'],
    ['DELETE', '/api/plans/plan-1'], ['POST', '/api/plans/plan-1/execute'],
    ['GET', '/api/plans/plan-1/extra'], ['POST', '/api/plans/plan-1/review/extra'], ['GET', '/api/plans/'],
  ]) {
    const result = await http.handle({ method, path, query: {}, headers: {}, body: {} });
    assert.equal(result.status, 404, `${method} ${path}`);
    assert.equal(result.body.error.code, 'PLANNING_NOT_FOUND');
  }
  assert.deepEqual(calls, []);
});

test('adapter-nest: autenticação bloqueia todas as rotas planning antes do dispatch', async () => {
  const calls = [];
  const handler = (...args) => { calls.push(args); return { id: 'plan-1' }; };
  const planning = { propose: handler, get: handler, review: handler };
  const http = planningAdapter(planning, { authenticate: async (headers) => headers.authorization === 'Bearer local-token' });
  for (const route of planningRoutes) {
    for (const headers of [{}, { authorization: 'Bearer wrong' }]) {
      const denied = await http.handle({ ...route, query: {}, headers, correlationId: 'auth-corr' });
      assert.equal(denied.status, 401);
      assert.equal(denied.body.error.code, 'UNAUTHENTICATED');
      assert.equal(denied.headers['www-authenticate'], 'Bearer');
      assert.equal(denied.headers['x-correlation-id'], 'auth-corr');
      assert.equal(denied.correlationId, 'auth-corr');
    }
    const remote = await planningAdapter(planning).handle({ ...route, query: {}, headers: {}, remoteAddress: '203.0.113.5' });
    assert.equal(remote.status, 401);
  }
  assert.deepEqual(calls, []);
  for (const route of planningRoutes) {
    const allowed = await http.handle({ ...route, query: {}, headers: { authorization: 'Bearer local-token' }, remoteAddress: '203.0.113.5' });
    assert.equal(allowed.status, 200);
  }
  assert.equal(calls.length, 3);
});

test('adapter-nest: OpenAPI publica operações planning concretas e as integra ao documento', () => {
  const paths = planningOpenApiPaths();
  const http = adapter().adapter;
  const document = http.openApi();
  assert.deepEqual(Object.keys(paths).sort(), ['/api/plans', '/api/plans/{id}', '/api/plans/{id}/review']);
  assert.equal(document.openapi, '3.1.0');
  assert.ok(document.paths['/health']);
  assert.equal(document.paths['/api/plans/:id'], undefined);
  assert.equal(document.paths['/api/plans/:id/review'], undefined);
  assert.deepEqual(http.modules().find((module) => module.name === 'PlanningModule').routes, ['/api/plans', '/api/plans/:id', '/api/plans/:id/review']);
  for (const [path, method, operationId] of [
    ['/api/plans', 'post', 'planPropose'], ['/api/plans/{id}', 'get', 'planGet'], ['/api/plans/{id}/review', 'post', 'planReview'],
  ]) {
    assert.deepEqual(document.paths[path], paths[path]);
    assert.deepEqual(Object.keys(paths[path]), [method]);
    const operation = paths[path][method];
    assert.equal(operation.operationId, operationId);
    if (path.includes('{id}')) assert.deepEqual(operation.parameters, [{ name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 1 } }]);
    assert.deepEqual(Object.keys(operation.responses).sort(), ['200', '400', '401', '403', '404', '409', '500', '503']);
    const proposal = operation.responses['200'].content['application/json'].schema;
    assert.equal(proposal.type, 'object');
    assert.deepEqual(proposal.required, ['id', 'version', 'digest', 'status', 'snapshot', 'budget', 'blockers']);
    assert.deepEqual(proposal.properties.version, { const: 1 });
    assert.deepEqual(proposal.properties.status.enum, ['draft', 'blocked', 'approved', 'rejected']);
    assert.deepEqual(proposal.properties.blockers.items.required, ['code', 'message']);
    for (const status of ['400', '401', '403', '404', '409', '500', '503']) {
      assert.deepEqual(operation.responses[status].content['application/json'].schema, {
        type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' } } } },
      });
    }
  }
  assert.equal(paths['/api/plans/{id}'].get.requestBody, undefined);
  const proposeBody = paths['/api/plans'].post.requestBody;
  assert.equal(proposeBody.required, true);
  const propose = proposeBody.content['application/json'].schema;
  assert.deepEqual(Object.keys(propose.properties).sort(), ['budget', 'correlationId', 'handoffId', 'taskId']);
  assert.deepEqual(propose.required, ['taskId']);
  assert.equal(propose.additionalProperties, false);
  assert.deepEqual(propose.properties.taskId, { type: 'string', minLength: 1 });
  assert.equal(propose.properties.budget.additionalProperties, false);
  assert.deepEqual(propose.properties.budget.required, ['inputTokens', 'outputTokens', 'totalTokens', 'usedTokens']);
  for (const field of propose.properties.budget.required) assert.deepEqual(propose.properties.budget.properties[field], { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
  const reviewBody = paths['/api/plans/{id}/review'].post.requestBody;
  assert.equal(reviewBody.required, true);
  assert.deepEqual(reviewBody.content['application/json'].schema, {
    type: 'object', properties: { decision: { type: 'string', enum: ['approved', 'rejected'] }, expectedDigest: { type: 'string', minLength: 1 }, reason: { type: 'string', minLength: 1 } },
    required: ['decision', 'expectedDigest', 'reason'], additionalProperties: false,
  });
});

test('adapter-nest: roteia REST, correlation id e módulos sem regra de domínio', async () => {
  const fixture = adapter();
  const health = await fixture.adapter.handle({ method: 'GET', path: '/health', query: {}, headers: {} });
  assert.equal(health.status, 200);
  const execute = await fixture.adapter.handle({ method: 'POST', path: '/api/capabilities/forja.http.test/execute', query: {}, headers: {}, body: { payload: { ok: true } }, correlationId: 'corr-1' });
  assert.equal(execute.status, 200);
  assert.equal(execute.headers['x-correlation-id'], 'corr-1');
  assert.equal(execute.body.status, 'succeeded');
  const server = createForjaServer({ mcp: fixture.mcp });
  assert.equal(server.modules().some((module) => module.name === 'CapabilityModule'), true);
  assert.equal(server.http.openApi().openapi, '3.1.0');
  const metrics = await fixture.adapter.handle({ method: 'GET', path: '/api/control-plane/metrics', query: {}, headers: {} });
  assert.equal(metrics.status, 200);
});

test('adapter-nest: autenticação local bloqueia requisição antes do dispatch', async () => {
  const fixture = adapter();
  const http = new ForjaNestAdapter(fixture.mcp, undefined, { authenticate: (headers) => headers.authorization === 'Bearer local-token' });
  const denied = await http.handle({ method: 'GET', path: '/health', query: {}, headers: {} });
  assert.equal(denied.status, 401);
  const allowed = await http.handle({ method: 'GET', path: '/health', query: {}, headers: { authorization: 'Bearer local-token' } });
  assert.equal(allowed.status, 200);
});

test('adapter-nest: autenticador Bearer compara token sem expor segredo', async () => {
  const { createBearerAuthenticator } = await import('../packages/adapter-nest/src/index.ts');
  const authenticator = createBearerAuthenticator('local-secret');
  assert.equal(await authenticator.authenticate({ authorization: 'Bearer local-secret' }), true);
  assert.equal(await authenticator.authenticate({ authorization: 'Bearer wrong' }), false);
  assert.equal(await authenticator.authenticate({}), false);
});

test('adapter-nest: delega runtime e approvals ao Control Plane configurado', async () => {
  const fixture = adapter();
  const controlPlane = new ControlPlane(undefined, { runtime: { start: (input) => ({ state: 'created', input }), get: (id) => ({ id }), execute: (id) => ({ id, state: 'completed' }), pause: (id) => ({ id, state: 'paused' }), resume: (id) => ({ id, state: 'running' }), cancel: (id) => ({ id, state: 'cancelled' }) }, approvals: { get: (id) => ({ id, decision: undefined }), decide: (input) => ({ input, decision: 'approved' }) } });
  const http = new ForjaNestAdapter(fixture.mcp, undefined, undefined, controlPlane);
  const started = await http.handle({ method: 'POST', path: '/api/executions', query: {}, headers: {}, body: { objective: 'test' } });
  assert.equal(started.body.state, 'created');
  const approval = await http.handle({ method: 'POST', path: '/api/approvals/approval-1/decide', query: {}, headers: {}, body: { decision: 'approved' } });
  assert.equal(approval.body.decision, 'approved');
});


test('adapter-nest: normaliza rota inválida e expõe SSE por stream injetado', async () => {
  const fixture = adapter();
  const missing = await fixture.adapter.handle({ method: 'GET', path: '/missing', query: {}, headers: {} });
  assert.equal(missing.status, 404);
  const stream = new InMemoryEventStream();
  const received = [];
  const http = new ForjaNestAdapter(fixture.mcp, stream);
  const unsubscribe = http.subscribeSse((event) => received.push(event));
  stream.publish({ id: 'event-1', event: 'execution.completed', data: { runId: 'run-1' }, correlationId: 'corr-2' });
  unsubscribe();
  assert.equal(received.length, 1);
  assert.equal(received[0].event, 'execution.completed');
});

test('isLoopbackAddress reconhece 127.0.0.0/8, ::1 e a forma ::ffff:-mapeada, e nada mais', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('127.0.0.53'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('203.0.113.5'), false, 'endereço remoto real não é loopback');
  assert.equal(isLoopbackAddress('10.0.0.5'), false, 'rede privada não é loopback');
  assert.equal(isLoopbackAddress(undefined), false, 'desconhecido não é "confiável" por padrão');
});

test('adapter-nest: sem autenticador configurado, falha fechado para não-loopback em vez de allow-all', async () => {
  const fixture = adapter();
  const http = new ForjaNestAdapter(fixture.mcp);
  // Sem authenticator e sem remoteAddress (chamada direta/in-process): mantém o comportamento
  // pré-existente usado pelos demais testes deste arquivo.
  const direct = await http.handle({ method: 'GET', path: '/health', query: {}, headers: {} });
  assert.equal(direct.status, 200);
  // Sem authenticator e com remoteAddress real, não-loopback: era aceito antes do fix; agora nega.
  const remote = await http.handle({ method: 'GET', path: '/health', query: {}, headers: {}, remoteAddress: '203.0.113.5' });
  assert.equal(remote.status, 401);
  // Sem authenticator, loopback genuíno: continua permitido (não quebra o dev local sem token).
  const loopback = await http.handle({ method: 'GET', path: '/health', query: {}, headers: {}, remoteAddress: '127.0.0.1' });
  assert.equal(loopback.status, 200);
});

// ForjaLocalAuthGuard (apps/server/src/forja-nest.module.ts) has decorators, so it can't be
// imported under plain `node --test` (no transform for @Injectable()/@Controller()); it's
// exercised via test/forja-local-auth-guard-probe.mjs instead, spawned with `--import tsx` — see
// test/forja-local-auth-guard.test.js.
