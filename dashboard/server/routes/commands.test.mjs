import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../index.mjs';

function parseSse(raw) {
  const events = [];
  for (const block of raw.split(/\n\n/)) {
    if (!block.trim()) continue;
    const lines = block.split('\n');
    const e = { event: null, data: [] };
    for (const line of lines) {
      if (line.startsWith('event: ')) e.event = line.slice(7);
      else if (line.startsWith('data: ')) e.data.push(line.slice(6));
    }
    e.data = e.data.join('\n');
    events.push(e);
  }
  return events;
}

test('GET /api/commands lista nomes permitidos', async () => {
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'GET', url: '/api/commands' });
  await app.close();
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.allowed));
  const names = body.allowed.map(a => a.name).sort();
  assert.deepEqual(names, ['context:build', 'design:check', 'design:select', 'gsd:check', 'gsd:handoff', 'gsd:plan', 'memory:vacuum', 'project:check', 'spec:check', 'sprint:status', 'sync:universal']);
});

test('POST /api/commands/gsd:plan rejeita args inválidos via SSE', async () => {
  const app = buildServer({ logger: false });
  const res = await app.inject({
    method: 'POST',
    url: '/api/commands/gsd:plan',
    payload: { args: ['x; rm -rf .'] },
  });
  await app.close();
  assert.equal(res.statusCode, 200);
  const events = parseSse(res.body);
  const exit = events.find(e => e.event === 'exit');
  const exitData = JSON.parse(exit.data);
  assert.equal(exitData.error, 'invalid_args');
});

test('POST /api/commands/rm:rf → 403 com payload útil', async () => {
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'POST', url: '/api/commands/rm:rf', payload: {} });
  await app.close();
  assert.equal(res.statusCode, 403);
  const body = res.json();
  assert.equal(body.code, 'COMMAND_NOT_ALLOWED');
  assert.equal(body.requested, 'rm:rf');
  assert.ok(Array.isArray(body.allowed));
});

test('POST /api/commands/spec%3Acheck%3B%20ls → 403 (injection bloqueada)', async () => {
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'POST', url: '/api/commands/' + encodeURIComponent('spec:check; ls') });
  await app.close();
  assert.equal(res.statusCode, 403);
});

test('POST /api/commands/spec:check emite eventos SSE válidos', async () => {
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'POST', url: '/api/commands/spec:check' });
  await app.close();
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/event-stream/);
  const events = parseSse(res.body);
  const types = events.map(e => e.event);
  assert.ok(types.includes('start'), 'esperava evento start');
  assert.ok(types.includes('exit'), 'esperava evento exit');
  assert.ok(types.includes('stdout') || types.includes('stderr'), 'esperava ao menos stdout/stderr');
  const exit = events.find(e => e.event === 'exit');
  const exitData = JSON.parse(exit.data);
  assert.ok([0, 1].includes(exitData.code), `exit code inesperado: ${exitData.code}`);
});

test('POST /api/commands/spec:check ack via start.cmd não vaza shell', async () => {
  const app = buildServer({ logger: false });
  const res = await app.inject({ method: 'POST', url: '/api/commands/spec:check' });
  await app.close();
  const events = parseSse(res.body);
  const start = events.find(e => e.event === 'start');
  const data = JSON.parse(start.data);
  assert.equal(data.cmd, 'node');
  assert.ok(Array.isArray(data.args));
  // garante que nenhum arg contém metacharacter de shell
  for (const arg of data.args) {
    assert.doesNotMatch(arg, /[;&|`$()]/);
  }
});
