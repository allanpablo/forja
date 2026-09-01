import { test } from 'node:test';
import assert from 'node:assert/strict';
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
