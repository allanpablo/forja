import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCliCapabilityRuntime, createLegacyCliRunner, CLI_CAPABILITY_SPECS } from '../apps/cli/src/index.ts';
import { McpServer } from '../packages/mcp/src/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mcpFor(cwd) {
  const runtime = createCliCapabilityRuntime(createLegacyCliRunner(repoRoot, cwd));
  return new McpServer({
    registry: runtime.registry,
    policy: runtime.policy,
    agent: {
      ...runtime.agent,
      permissions: ['read', 'write', 'execution', 'database'],
      capabilities: runtime.registry.list().map((d) => d.id),
    },
    audit: { append() {} },
  });
}

test('cobertura: o núcleo do fluxo está registrado', () => {
  const commands = new Set(CLI_CAPABILITY_SPECS.map((s) => s.command));
  for (const cmd of ['spec:new', 'spec:plan', 'spec:tasks', 'query:universal', 'engineer', 'risk:assess', 'orchestrate:status', 'orchestrate:advance', 'drift:check', 'code:context', 'status', 'next']) {
    assert.ok(commands.has(cmd), `comando fora da cobertura MCP: ${cmd}`);
  }
  assert.ok(CLI_CAPABILITY_SPECS.length >= 18, `esperava ≥18 specs, achei ${CLI_CAPABILITY_SPECS.length}`);
});

test('MCP tools/list expõe o núcleo', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-mcp-'));
  try {
    const names = mcpFor(tmp).listTools().map((t) => t.name);
    for (const id of ['spec_create', 'spec_plan', 'memory_query', 'engineering_facade', 'risk_assess', 'orchestrate_status']) {
      assert.ok(names.includes(`forja_capability_${id}`), `tool ausente: forja_capability_${id}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('e2e: fluxo spec.create → spec.validate por tools/call num workspace isolado', { concurrency: false }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-mcp-e2e-'));
  fs.mkdirSync(path.join(tmp, 'specs'), { recursive: true });
  try {
    const mcp = mcpFor(tmp);

    const created = await mcp.callTool('forja_capability_spec_create', { payload: { slug: 'mcp-e2e' }, categories: ['write'] });
    assert.equal(created.structuredContent.status, 'succeeded', JSON.stringify(created.structuredContent));
    assert.ok(fs.existsSync(path.join(tmp, 'specs', 'mcp-e2e', 'spec.md')), 'spec.md não foi criado pelo tools/call');

    const validated = await mcp.callTool('forja_capability_spec_validate', { payload: { feature: 'mcp-e2e' }, categories: ['read'] });
    assert.equal(validated.structuredContent.status, 'succeeded');
    assert.equal(validated.structuredContent.output.payload.exitCode, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
