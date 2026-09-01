import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistry } from '../packages/core/src/index.ts';
import { McpServer } from '../packages/mcp/src/index.ts';
import { ForjaNestAdapter, InMemoryEventStream, isLoopbackAddress } from '../packages/adapter-nest/src/index.ts';
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
