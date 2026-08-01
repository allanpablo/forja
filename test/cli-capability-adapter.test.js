import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  capabilityIdForCommand,
  createCliCapabilityRuntime,
  executeCliCapability,
  parseLegacyCommandInput,
  registerGraphSyncCapability,
} from '../apps/cli/src/index.ts';
import { GraphLoop } from '../packages/graph/src/index.ts';

const success = (command, args) => ({
  exitCode: 0,
  stdout: `${command} ok`,
  stderr: '',
  command,
  args,
});

test('CLI adapter maps the three proof commands to discoverable capabilities', () => {
  const runtime = createCliCapabilityRuntime(() => success('noop', []));
  assert.deepEqual(runtime.registry.list().map((item) => item.id), ['code.impact', 'context.budget', 'handoff.create', 'spec.validate', 'sprint.status', 'system.doctor']);
  assert.equal(capabilityIdForCommand('tools:doctor'), 'system.doctor');
  assert.equal(runtime.registry.describe('code:impact').id, 'code.impact');
  assert.equal(runtime.registry.describe('context.budget').aliases[0], 'context:budget');
});

test('graph.sync é descobrível, idempotente e retorna evidência', async () => {
  const runtime = createCliCapabilityRuntime(() => success('noop', []));
  const graph = new GraphLoop();
  registerGraphSyncCapability(runtime.registry, graph, { listDocuments: () => [{ nodeId: 'sync-document', locator: 'src/sync.ts', capturedAt: '2026-08-01T00:00:00.000Z', content: 'export const sync = true;' }] });
  const agent = { ...runtime.agent, permissions: ['read', 'write'] };
  const policy = { authorize: () => ({ effect: 'ALLOW', reason: 'test', policyId: 'test' }) };
  const result = await runtime.registry.execute({ input: { capabilityId: 'graph.sync', payload: {} }, agent, policy, categories: ['write'], files: [] });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.output.payload.indexed, 1);
  assert.equal(result.evidence[0].source, 'forja.graph');
  const repeat = await runtime.registry.execute({ input: { capabilityId: 'graph.sync', payload: {} }, agent, policy, categories: ['write'], files: [] });
  assert.equal(repeat.output.payload.skipped, 1);
});

test('CLI adapter preserves legacy arguments and returns ExecutionResult', async () => {
  const calls = [];
  const runtime = createCliCapabilityRuntime((command, args) => {
    calls.push({ command, args: [...args] });
    return success(command, args);
  });

  const result = await executeCliCapability(runtime, 'code.impact', { symbol: 'CapabilityRegistry', depth: 2 });

  assert.equal(result.status, 'succeeded');
  assert.match(result.runId, /^[0-9a-f-]{36}$/);
  assert.match(result.correlationId, /^[0-9a-f-]{36}$/);
  assert.equal(result.output.payload.command, 'code:impact');
  assert.deepEqual(calls, [{ command: 'code:impact', args: ['CapabilityRegistry', '2'] }]);
  assert.equal(result.evidence[0].source, 'forja.cli');
});

test('CLI adapter rejects invalid input before invoking the legacy handler', async () => {
  let called = false;
  const runtime = createCliCapabilityRuntime(() => {
    called = true;
    return success('code:impact', []);
  });

  const result = await executeCliCapability(runtime, 'code.impact', { depth: 0 });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'INVALID_INPUT');
  assert.equal(called, false);
});

test('CLI adapter normalizes a non-zero legacy exit as a failed execution', async () => {
  const runtime = createCliCapabilityRuntime(() => ({ exitCode: 2, stdout: '', stderr: 'failure' }));
  const result = await executeCliCapability(runtime, 'context.budget', { target: 'missing-context' });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'LEGACY_COMMAND_FAILED');
  assert.equal(result.output.payload.exitCode, 2);
  assert.equal(result.evidence[0].status, 'contradicted');
});

test('CLI adapter keeps policy as a gate before handler execution', async () => {
  let called = false;
  const runtime = createCliCapabilityRuntime(() => {
    called = true;
    return success('tools:doctor', []);
  });
  const result = await runtime.registry.execute({
    input: { capabilityId: 'system.doctor', payload: {} },
    agent: runtime.agent,
    policy: { authorize: () => ({ effect: 'DENY', reason: 'test deny', policyId: 'test' }) },
    environment: 'local',
    categories: ['read'],
    files: [],
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.error.code, 'POLICY_DENIED');
  assert.equal(called, false);
});

test('legacy positional arguments are translated deterministically', () => {
  assert.deepEqual(parseLegacyCommandInput('tools:doctor', []), { capabilityId: 'system.doctor', payload: {} });
  assert.deepEqual(parseLegacyCommandInput('context:budget', ['task.md', '900']), {
    capabilityId: 'context.budget',
    payload: { target: 'task.md', limitTokens: 900 },
  });
  assert.deepEqual(parseLegacyCommandInput('spec:check', ['demo-feature']), {
    capabilityId: 'spec.validate',
    payload: { feature: 'demo-feature' },
  });
  assert.deepEqual(parseLegacyCommandInput('gsd:handoff', ['plan', 'demo-feature', 'ready', 'for', 'review']), {
    capabilityId: 'handoff.create',
    payload: { phase: 'plan', slug: 'demo-feature', context: 'ready for review' },
  });
});

test('Sprint 2 capabilities validate handoff writes through the policy gate', async () => {
  const calls = [];
  const runtime = createCliCapabilityRuntime((command, args) => {
    calls.push({ command, args: [...args] });
    return success(command, args);
  });
  const result = await executeCliCapability(runtime, 'handoff.create', { phase: 'review', slug: 'cli-capabilities' });

  assert.equal(result.status, 'succeeded');
  assert.deepEqual(calls, [{ command: 'gsd:handoff', args: ['review', 'cli-capabilities'] }]);
  assert.equal(result.output.payload.command, 'gsd:handoff');
});

test('Sprint 2 capabilities reject invalid phases before executing', async () => {
  let called = false;
  const runtime = createCliCapabilityRuntime(() => {
    called = true;
    return success('gsd:handoff', []);
  });
  const result = await executeCliCapability(runtime, 'handoff.create', { phase: 'publish', slug: 'x' });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'INVALID_INPUT');
  assert.equal(called, false);
});
