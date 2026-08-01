import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ForjaSdk, SdkError } from '../packages/sdk/src/index.ts';

function transport() {
  const requests = [];
  const listeners = new Set();
  return {
    requests,
    transport: {
      request: async (input) => { requests.push(input); return { status: 200, headers: {}, body: input.path === '/api/capabilities' ? [{ id: 'forja.test.capability' }] : { ok: true, path: input.path } }; },
      subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    },
    publish: (event) => { for (const listener of listeners) listener(event); },
  };
}

test('sdk: mapeia chamadas tipadas para REST e preserva headers de identidade/correlation', async () => {
  const fixture = transport();
  const sdk = new ForjaSdk(fixture.transport, { token: 'local-token', correlationId: 'sdk-correlation' });
  const capabilities = await sdk.listCapabilities();
  assert.equal(capabilities[0].id, 'forja.test.capability');
  await sdk.executeCapability('forja.test.capability', { ok: true }, { files: ['src/a.ts'] });
  assert.equal(fixture.requests[1].path, '/api/capabilities/forja.test.capability/execute');
  assert.equal(fixture.requests[1].headers.authorization, 'Bearer local-token');
  assert.equal(fixture.requests[1].headers['x-correlation-id'], 'sdk-correlation');
  assert.deepEqual(fixture.requests[1].body.files, ['src/a.ts']);
  await sdk.metrics();
  assert.equal(fixture.requests[2].path, '/api/control-plane/metrics');
});

test('sdk: assina eventos e normaliza respostas HTTP não bem-sucedidas', async () => {
  const fixture = transport();
  const sdk = new ForjaSdk({ request: async () => ({ status: 403, headers: {}, body: { code: 'DENIED' } }) });
  await assert.rejects(() => sdk.workspaceStatus(), (error) => error instanceof SdkError && error.status === 403);
  const events = [];
  const unsubscribe = new ForjaSdk(fixture.transport).subscribeEvents((event) => events.push(event));
  fixture.publish({ id: 'event-1', type: 'execution.completed', data: { runId: 'run-1' } });
  unsubscribe();
  assert.equal(events[0].type, 'execution.completed');
});
