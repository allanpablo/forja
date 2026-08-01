import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginError, PluginRegistry } from '../packages/plugin-sdk/src/index.ts';

const manifest = (permissions = ['capabilities:list']) => ({ id: 'example.plugin', version: '2.0.0', capabilities: [], permissions, events: [], migrations: [], dashboardExtensions: [], compatibleCore: '^2.0.0' });

test('plugin context denies undeclared resources', async () => {
  const registry = new PluginRegistry({ listCapabilities: () => ['capability'] });
  const context = await registry.register({ manifest: manifest() });
  await assert.rejects(() => context.workspaceStatus(), PluginError);
  assert.deepEqual(await context.listCapabilities(), ['capability']);
});

test('plugin can use only declared capability permission', async () => {
  const registry = new PluginRegistry({ executeCapability: (id, payload) => ({ id, payload }) });
  const context = await registry.register({ manifest: manifest(['capability:execute']), setup: async (value) => { await assert.rejects(() => value.listCapabilities(), PluginError); } });
  assert.deepEqual(await context.executeCapability('example.read', { ok: true }), { id: 'example.read', payload: { ok: true } });
});

test('plugin ids and duplicate registrations are validated', async () => {
  const registry = new PluginRegistry({});
  await assert.rejects(() => registry.register({ manifest: { ...manifest(), id: 'Invalid Plugin' } }), PluginError);
  await registry.register({ manifest: manifest() });
  await assert.rejects(() => registry.register({ manifest: manifest() }), PluginError);
});
