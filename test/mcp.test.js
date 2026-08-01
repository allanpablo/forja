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
  return new McpServer({ registry, policy, agent, graph, context, handoffEngine: new HandoffEngine(new InMemoryOrchestrationStore()), resources: [{ uri: 'forja://workspace/current', name: 'workspace', description: 'workspace', mimeType: 'application/json', read: () => ({ root: '/workspace', offline: true }) }], ...overrides });
}

test('mcp: lista tools, executa capability/contexto/grafo e lê recurso estruturado', async () => {
  const mcp = server();
  assert.equal(mcp.listTools().some((tool) => tool.name === 'forja_context_build'), true);
  assert.equal(mcp.listResources().length, 7);
  const capability = await mcp.callTool('forja_capabilities_list');
  assert.equal(capability.isError, false);
  assert.equal(capability.structuredContent[0].id, 'forja.test.run');
  const execution = await mcp.callTool('forja_capability_execute', { capabilityId: 'forja.test.run', payload: { ok: true }, categories: [], files: [] });
  assert.equal(execution.structuredContent.status, 'succeeded');
  const context = await mcp.callTool('forja_context_build', { objective: 'mcp', budget: { inputTokens: 20, outputTokens: 0, totalTokens: 20, usedTokens: 0 } });
  assert.equal(context.isError, false);
  const graph = await mcp.callTool('forja_graph_query', { labelIncludes: 'task' });
  assert.equal(graph.structuredContent.length, 1);
  const resource = await mcp.readResource('forja://workspace/current');
  assert.deepEqual(resource.structuredContent, { root: '/workspace', offline: true });
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
