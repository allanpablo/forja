import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { CapabilityRegistry } from '../packages/core/src/index.ts';
import { ContextEngine } from '../packages/context/src/index.ts';
import { GraphLoop } from '../packages/graph/src/index.ts';
import { HandoffEngine, InMemoryOrchestrationStore } from '../packages/orchestration/src/index.ts';
import { McpServer } from '../packages/mcp/src/index.ts';

const agent = { id: 'agent-mcp', name: 'MCP agent', role: 'developer', autonomy: 'supervised', permissions: ['read'], capabilities: [] };
const policy = { authorize: () => ({ effect: 'ALLOW', reason: 'test', policyId: 'test-policy' }), canDiscover: () => true };
const definition = { schemaVersion: '2.0', createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z', correlationId: 'mcp-test', id: 'forja.test.run', version: '1.0.0', description: 'test capability', permissions: ['read'], risk: 'low', sideEffects: [], requirements: [], supportsAutonomy: true, idempotent: true, timeoutMs: 1000, retry: { maxAttempts: 1, backoffMs: 0 }, aliases: [] };

function server(overrides = {}) {
  const registry = new CapabilityRegistry();
  registry.register({ definition, validateInput: (input) => input, validateOutput: (output) => output, handler: async (input, context) => ({ capabilityId: definition.id, payload: input, evidence: [] }) });
  const graph = new GraphLoop();
  graph.addEvidence({ id: 'e-1', source: 'test', locator: 'mcp.test', capturedAt: '2026-07-31T00:00:00.000Z', status: 'verified' });
  graph.upsertNode({ id: 'node-1', type: 'Task', label: 'MCP task', status: 'verified' });
  const context = new ContextEngine({ memory: { search: () => [{ id: 'candidate-1', source: 'memory', locator: 'memory/mcp.md', content: 'evidence', relevance: 1, status: 'verified', evidence: [{ id: 'e-1', source: 'test', locator: 'mcp.test', capturedAt: '2026-07-31T00:00:00.000Z', status: 'verified' }] }] } });
  return new McpServer({ registry, policy, agent, graph, context, handoffEngine: new HandoffEngine(new InMemoryOrchestrationStore()), resources: [{ uri: 'forja://workspace/current', name: 'workspace', description: 'workspace', mimeType: 'application/json', read: () => ({ root: '/workspace', offline: true }) }], audit: { append: (event) => { server.auditEvents.push(event); } }, ...overrides });
}

server.auditEvents = [];

test('mcp: delega proposta e consulta ao planning, sem expor review', async () => {
  const calls = [];
  const events = [];
  const proposal = { id: 'plan-1', status: 'draft', digest: 'digest-1' };
  const mcp = server({
    planning: {
      propose: async (input) => { calls.push(['propose', input]); return proposal; },
      get: async (id) => { calls.push(['get', id]); return proposal; },
    },
    audit: { append: (event) => events.push(event) },
  });
  assert.deepEqual(mcp.listTools().filter((tool) => tool.name.startsWith('forja_plan_')).map((tool) => tool.name).sort(), ['forja_plan_get', 'forja_plan_propose']);
  const input = { taskId: 'task-1', handoffId: 'handoff-1', correlationId: 'plan-corr', budget: { inputTokens: 20, outputTokens: 10, totalTokens: 30, usedTokens: 0 } };
  for (const [name, args] of [['forja_plan_propose', input], ['forja_plan_get', { id: 'plan-1' }]]) {
    const result = await mcp.callTool(name, args);
    assert.deepEqual(result, { isError: false, structuredContent: proposal, content: [{ type: 'text', text: JSON.stringify(proposal) }] });
  }
  const review = await mcp.callTool('forja_plan_review', { id: 'plan-1', decision: 'approved', expectedDigest: 'digest-1', reason: 'checked' });
  assert.equal(review.isError, true);
  assert.equal(review.structuredContent.code, 'TOOL_NOT_FOUND');
  assert.deepEqual(calls, [['propose', input], ['get', 'plan-1']]);
  assert.equal(events[0].correlationId, 'plan-corr');
  assert.equal(events[0].outcome, 'success');
});

test('mcp: planning ausente ou falhando retorna erro estruturado', async () => {
  for (const planning of [undefined, { propose: async () => { throw new Error('provider failed'); }, get: async () => { throw new Error('provider failed'); } }]) {
    const mcp = server({ planning, audit: undefined });
    for (const [name, input] of [['forja_plan_propose', { taskId: 'task-1' }], ['forja_plan_get', { id: 'plan-1' }]]) {
      const result = await mcp.callTool(name, input);
      assert.equal(result.isError, true, name);
      assert.equal(result.structuredContent.code, 'TOOL_FAILED');
      assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    }
  }
});

test('mcp: publica schemas estritos de proposta, budget e consulta', () => {
  const tools = server().listTools();
  const proposeSchema = tools.find((tool) => tool.name === 'forja_plan_propose').inputSchema;
  const getSchema = tools.find((tool) => tool.name === 'forja_plan_get').inputSchema;
  const ajv = new Ajv();
  const propose = ajv.compile(proposeSchema);
  const get = ajv.compile(getSchema);
  assert.deepEqual(Object.keys(proposeSchema.properties).sort(), ['budget', 'correlationId', 'handoffId', 'taskId']);
  assert.deepEqual(proposeSchema.required, ['taskId']);
  assert.equal(proposeSchema.additionalProperties, false);
  assert.deepEqual(getSchema, { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false });
  const budget = { inputTokens: 20, outputTokens: 10, totalTokens: 30, usedTokens: 0 };
  assert.equal(propose({ taskId: 'task-1' }), true);
  assert.equal(propose({ taskId: 'task-1', handoffId: 'handoff-1', correlationId: 'corr-1', budget }), true);
  assert.equal(get({ id: 'plan-1' }), true);
  for (const input of [{}, { taskId: '' }, { taskId: 1 }, { taskId: 'task-1', handoffId: '' }, { taskId: 'task-1', correlationId: 1 }, { taskId: 'task-1', reviewerId: 'spoofed' }]) {
    assert.equal(propose(input), false, JSON.stringify(input));
  }
  for (const value of [null, [], 'budget', { ...budget, extra: 1 }]) {
    assert.equal(propose({ taskId: 'task-1', budget: value }), false, JSON.stringify(value));
  }
  for (const field of Object.keys(budget)) {
    const incomplete = { ...budget };
    delete incomplete[field];
    assert.equal(propose({ taskId: 'task-1', budget: incomplete }), false, `budget exige ${field}`);
    for (const value of [-1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(propose({ taskId: 'task-1', budget: { ...budget, [field]: value } }), false, `${field}: ${value}`);
    }
    for (const value of [0, Number.MAX_SAFE_INTEGER]) {
      assert.equal(propose({ taskId: 'task-1', budget: { ...budget, [field]: value } }), true, `${field}: ${value}`);
    }
  }
  for (const input of [{}, { id: 1 }, { id: 'plan-1', correlationId: 'unexpected' }]) assert.equal(get(input), false);
});

test('mcp: consulta rejeita id inválido e campos extras antes do provider', async () => {
  const calls = [];
  const mcp = server({ planning: { get: (id) => calls.push(id) }, audit: undefined });
  for (const input of [{}, { id: '' }, { id: '  ' }, { id: 1 }, { id: 'plan-1', extra: true }, null]) {
    const result = await mcp.callTool('forja_plan_get', input);
    assert.equal(result.isError, true, JSON.stringify(input));
    assert.equal(result.structuredContent.code, 'TOOL_FAILED');
  }
  assert.deepEqual(calls, []);
});

test('mcp: lista tools, executa capability/contexto/grafo e lê recurso estruturado', async () => {
  const mcp = server();
  assert.equal(mcp.listTools().some((tool) => tool.name === 'forja_context_build'), true);
  assert.equal(mcp.listTools().some((tool) => tool.name === 'forja_capability_describe'), true);
  assert.equal(mcp.listTools().some((tool) => tool.name === 'forja_capability_forja_test_run'), true);
  assert.equal(mcp.listResources().length, 7);
  const capability = await mcp.callTool('forja_capabilities_list');
  assert.equal(capability.isError, false);
  assert.equal(capability.structuredContent[0].id, 'forja.test.run');
  const described = await mcp.callTool('forja_capability_describe', { capabilityId: 'forja.test.run' });
  assert.equal(described.structuredContent.id, 'forja.test.run');
  const execution = await mcp.callTool('forja_capability_execute', { capabilityId: 'forja.test.run', payload: { ok: true }, categories: [], files: [] });
  assert.equal(execution.structuredContent.status, 'succeeded');
  const dynamic = await mcp.callTool('forja_capability_forja_test_run', { payload: { dynamic: true } });
  assert.equal(dynamic.structuredContent.status, 'succeeded');
  const context = await mcp.callTool('forja_context_build', { objective: 'mcp', budget: { inputTokens: 20, outputTokens: 0, totalTokens: 20, usedTokens: 0 } });
  assert.equal(context.isError, false);
  const graph = await mcp.callTool('forja_graph_query', { labelIncludes: 'task' });
  assert.equal(graph.structuredContent.length, 1);
  const resource = await mcp.readResource('forja://workspace/current');
  assert.deepEqual(resource.structuredContent, { root: '/workspace', offline: true });
  assert.equal(server.auditEvents.some((event) => event.tool === 'forja_capabilities_list' && event.outcome === 'success'), true);
});

test('mcp: normaliza erros, exige dependências configuradas e aplica policy no handoff', async () => {
  const blocked = server({ mcpPolicy: { authorize: () => ({ effect: 'DENY', reason: 'write denied', policyId: 'deny' }) } });
  const result = await blocked.callTool('forja_handoff_create', { from: 'a', to: 'b', intent: 'implement', objective: 'x', acceptance: ['done'], evidenceIds: ['e-1'], nextAgent: 'b' });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.code, 'TOOL_FAILED');
  const missing = await server({ context: undefined }).callTool('forja_context_build', { objective: 'x', budget: { inputTokens: 1, outputTokens: 0, totalTokens: 1, usedTokens: 0 } });
  assert.equal(missing.isError, true);
  const unknown = await server().callTool('forja_unknown');
  assert.equal(unknown.structuredContent.code, 'TOOL_NOT_FOUND');
  const resource = await server().readResource('forja://missing');
  assert.equal(resource.structuredContent.code, 'RESOURCE_NOT_FOUND');
});

// Antes só forja_handoff_create passava por authorize(); as demais tools (queries de leitura,
// spec_check/test_run/execution_validate) executavam sem nenhum gate de policy na superfície MCP.
test('mcp: aplica policy também nas tools antes não-checadas (query, impact, task_next, spec/test/validate)', async () => {
  const deny = { authorize: () => ({ effect: 'DENY', reason: 'mcp policy denied', policyId: 'deny-all' }) };
  let ran = false;
  const memory = { query: () => { ran = true; return { hit: true }; } };
  const specChecker = { check: () => { ran = true; return { ok: true }; } };
  const testRunner = { run: () => { ran = true; return { ok: true }; } };
  const executionValidator = { validate: () => { ran = true; return { ok: true }; } };

  const blocked = server({ mcpPolicy: deny, memory, specChecker, testRunner, executionValidator });

  for (const [tool, input] of [
    ['forja_memory_query', { objective: 'x' }],
    ['forja_graph_query', {}],
    ['forja_code_impact', { origin: 'node-1' }],
    ['forja_task_next', { sprintId: 'sprint-1' }],
    ['forja_spec_check', {}],
    ['forja_test_run', {}],
    ['forja_execution_validate', {}],
  ]) {
    ran = false;
    const result = await blocked.callTool(tool, input);
    assert.equal(result.isError, true, `${tool} deveria ser bloqueada pela mcpPolicy`);
    assert.equal(result.structuredContent.code, 'TOOL_FAILED');
    assert.equal(ran, false, `${tool} não deveria ter chegado a executar o adapter subjacente`);
  }

  // policy que ALLOW ainda deixa a mesma query passar normalmente
  const allowed = server({ mcpPolicy: { authorize: () => ({ effect: 'ALLOW', reason: 'ok', policyId: 'allow-all' }) }, memory });
  const passed = await allowed.callTool('forja_memory_query', { objective: 'x' });
  assert.equal(passed.isError, false);
  assert.deepEqual(passed.structuredContent, { hit: true });
});
