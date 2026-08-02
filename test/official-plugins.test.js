import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginError, PluginRegistry } from '../packages/plugin-sdk/src/index.ts';
import { githubPlugin } from '../packages/plugin-github/src/index.ts';
import { dockerPlugin } from '../packages/plugin-docker/src/index.ts';

test('official plugins expose permissioned manifests through the shared plugin registry', async () => {
  const registry = new PluginRegistry({ listCapabilities: () => [] });
  await registry.register(githubPlugin);
  await registry.register(dockerPlugin);
  assert.deepEqual(registry.list().map((item) => item.id), ['forja.github', 'forja.docker']);
  assert.ok(registry.get('forja.github')?.capabilities.includes('github.issue.list'));
  assert.ok(registry.get('forja.docker')?.permissions.includes('capability:execute'));
});

test('official plugin cannot access undeclared service permission', async () => {
  const registry = new PluginRegistry({ respondApproval: async () => ({ ok: true }) });
  const context = await registry.register(githubPlugin);
  await assert.rejects(() => context.respondApproval('approval-1', {}), PluginError);
});
