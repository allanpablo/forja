import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../index.mjs';
import { publish } from '../lib/events.mjs';

test('GET /api/events abre SSE com evento hello', async () => {
  const app = buildServer({ logger: false });
  await app.ready();
  await app.listen({ host: '127.0.0.1', port: 0 });
  try {
    const addr = app.server.address();
    const url = `http://127.0.0.1:${addr.port}/api/events`;
    const controller = new AbortController();
    const res = await fetch(url, { signal: controller.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);

    // publica algo
    setTimeout(() => publish('test.foo', { x: 42 }), 20);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const start = Date.now();
    while (Date.now() - start < 1000) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (buf.includes('event: hello') && buf.includes('event: test.foo')) break;
    }
    controller.abort();
    assert.match(buf, /event: hello/);
    assert.match(buf, /event: test\.foo/);
    assert.match(buf, /"x":42/);
  } finally {
    await app.close();
  }
});
