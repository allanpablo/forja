import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bus, publish, newSource, spawnWithEvents } from './events.mjs';

test('publish empurra evento no bus', () => {
  const events = [];
  const handler = (e) => events.push(e);
  bus.on('event', handler);
  try {
    publish('foo', { x: 1 });
    publish('bar', { y: 'z' });
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'foo');
    assert.equal(events[0].x, 1);
    assert.ok(events[0].ts > 0);
    assert.equal(events[1].type, 'bar');
  } finally { bus.off('event', handler); }
});

test('newSource gera id curto único', () => {
  const set = new Set();
  for (let i = 0; i < 50; i++) set.add(newSource());
  assert.equal(set.size, 50);
});

test('spawnWithEvents emite command.started/stdout/exit', async () => {
  const events = [];
  const handler = (e) => events.push(e);
  bus.on('event', handler);
  try {
    const r = await spawnWithEvents('node', ['-e', 'console.log("hi"); console.error("err"); process.exit(7)'], {});
    assert.equal(r.code, 7);
    const types = events.map(e => e.type);
    assert.ok(types.includes('command.started'));
    assert.ok(types.includes('command.stdout'));
    assert.ok(types.includes('command.stderr'));
    assert.ok(types.includes('command.exit'));
    const exit = events.find(e => e.type === 'command.exit');
    assert.equal(exit.code, 7);
  } finally { bus.off('event', handler); }
});
