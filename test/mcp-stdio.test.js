import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function startClient() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-mcp-stdio-'));
  const database = path.join(workspace, 'runtime.db');
  const child = spawn(process.execPath, ['bin/forja.ts', 'mcp:start'], {
    cwd: root,
    env: { ...process.env, FORJA_WORKSPACE: workspace, FORJA_RUNTIME_DB: database, FORJA_GRAPH_ROOT: root },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  const pending = new Map();
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines.filter((value) => value.trim().length > 0)) {
      let response;
      try { response = JSON.parse(line); } catch (error) { for (const item of pending.values()) item.reject(new Error(`Invalid MCP stdout: ${line}`)); pending.clear(); continue; }
      const waiter = pending.get(response.id);
      if (waiter !== undefined) { pending.delete(response.id); waiter.resolve(response); }
    }
  });
  return {
    child,
    workspace,
    stderr: () => stderr,
    request: (id, method, params = {}) => new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); }),
    notify: (method, params = {}) => { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`); },
  };
}

test('MCP stdio real: initialize, discover, describe, execute, resource and shutdown', async () => {
  const client = startClient();
  try {
    const initialized = await client.request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'forja-test-client', version: '1.0.0' } });
    assert.equal(initialized.jsonrpc, '2.0');
    assert.equal(initialized.id, 1);
    assert.equal(initialized.result.serverInfo.name, 'forja');
    client.notify('notifications/initialized');

    const listed = await client.request(2, 'tools/list');
    assert.equal(listed.error, undefined);
    const names = listed.result.tools.map((tool) => tool.name);
    assert.ok(names.includes('forja_capabilities_list'));
    assert.ok(names.includes('forja_capability_system_doctor'));

    const described = await client.request(3, 'tools/call', { name: 'forja_capability_describe', arguments: { capabilityId: 'system.doctor' } });
    assert.equal(described.result.isError, false);
    assert.equal(described.result.structuredContent.id, 'system.doctor');

    const execution = await client.request(4, 'tools/call', { name: 'forja_capability_system_doctor', arguments: { categories: ['read'], payload: {} } });
    assert.equal(execution.result.isError, false);
    assert.ok(['succeeded', 'failed', 'blocked'].includes(execution.result.structuredContent.status));
    assert.equal(typeof execution.result.structuredContent.runId, 'string');

    const resources = await client.request(5, 'resources/list');
    assert.ok(resources.result.resources.some((resource) => resource.uri === 'forja://workspace/current'));
    const resource = await client.request(6, 'resources/read', { uri: 'forja://workspace/current' });
    assert.equal(resource.result.isError, false);
    assert.equal(typeof resource.result.structuredContent, 'object');
    assert.equal(client.stderr(), '');
  } finally {
    client.child.stdin.end();
    const exitCode = await new Promise((resolve) => client.child.once('exit', (code) => resolve(code)));
    assert.equal(exitCode, 0);
    fs.rmSync(client.workspace, { recursive: true, force: true });
  }
});
