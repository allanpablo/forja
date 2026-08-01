import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { EventBus } from '../packages/events/src/index.ts';
import { SqliteEventStore, SqliteMigrationRunner } from '../packages/adapter-sqlite/src/index.ts';
import { Scheduler, matchesCron } from '../packages/scheduler/src/index.ts';

const aggregateId = 'aggregate-1';

test('events: append-only, sequência por aggregate e idempotência', async () => {
  const bus = new EventBus();
  const first = await bus.append({ type: 'task.created', aggregateId, payload: { n: 1 }, idempotencyKey: 'task-1' });
  const duplicate = await bus.append({ type: 'task.created', aggregateId, payload: { n: 999 }, idempotencyKey: 'task-1' });
  const second = await bus.append({ type: 'task.updated', aggregateId, payload: { n: 2 }, idempotencyKey: 'task-2' });
  assert.equal(first.id, duplicate.id);
  assert.equal(second.sequence, 2);
  assert.equal((await bus.list()).length, 2);
});

test('events: consumidor retryable é reprocessado e marcado idempotente', async () => {
  const bus = new EventBus();
  let attempts = 0;
  bus.subscribe({ id: 'consumer', eventTypes: ['task.created'], maxRetries: 2 }, () => {
    attempts += 1;
    if (attempts === 1) throw new Error('transient');
  });
  await bus.append({ type: 'task.created', aggregateId, payload: {}, idempotencyKey: 'retry-1' });
  assert.equal(attempts, 2);
  assert.equal(bus.getDeadLetters().length, 0);
});

test('events: consumidor persistente falho vai para dead-letter', async () => {
  const bus = new EventBus();
  bus.subscribe({ id: 'consumer', eventTypes: ['*'], maxRetries: 1 }, () => { throw new Error('broken'); });
  await bus.append({ type: 'test.failed', aggregateId, payload: {}, idempotencyKey: 'dead-1' });
  const dead = bus.getDeadLetters();
  assert.equal(dead.length, 1);
  assert.equal(dead[0].attempts, 2);
});

test('scheduler: one-shot executa uma vez e respeita cancelamento/conclusão', async () => {
  const scheduler = new Scheduler();
  let calls = 0;
  scheduler.register({ id: 'once', trigger: { kind: 'one-shot', at: '2026-07-31T10:00:00.000Z' }, maxRetries: 0, action: () => { calls += 1; } });
  await scheduler.tick(new Date('2026-07-31T09:59:00.000Z'));
  await scheduler.tick(new Date('2026-07-31T10:01:00.000Z'));
  await scheduler.tick(new Date('2026-07-31T10:02:00.000Z'));
  assert.equal(calls, 1);
  assert.equal(scheduler.cancel('once'), true);
});

test('scheduler: cron é determinístico por minuto e condição/evento disparam', async () => {
  assert.equal(matchesCron('*/5 * * * *', new Date('2026-07-31T10:10:00.000Z')), true);
  assert.equal(matchesCron('*/5 * * * *', new Date('2026-07-31T10:11:00.000Z')), false);
  const scheduler = new Scheduler();
  const calls = [];
  scheduler.register({ id: 'cron', trigger: { kind: 'cron', expression: '*/5 * * * *' }, maxRetries: 0, action: () => { calls.push('cron'); } });
  scheduler.register({ id: 'condition', trigger: { kind: 'condition', evaluate: () => true }, maxRetries: 0, action: () => { calls.push('condition'); } });
  scheduler.register({ id: 'event', trigger: { kind: 'event', eventType: 'task.created', aggregateId }, maxRetries: 0, action: (context) => { calls.push(context.event.type); } });
  const minute = new Date('2026-07-31T10:10:00.000Z');
  await scheduler.tick(minute);
  await scheduler.tick(minute);
  await scheduler.onEvent({ schemaVersion: '2.0', id: 'event-1', type: 'task.created', aggregateId, sequence: 1, payload: {}, idempotencyKey: 'event-1', correlationId: 'event-1', createdAt: minute.toISOString(), updatedAt: minute.toISOString() });
  assert.deepEqual(calls, ['cron', 'condition', 'task.created']);
});

test('scheduler: retry e dead-letter respeitam limite', async () => {
  const scheduler = new Scheduler();
  let attempts = 0;
  scheduler.register({ id: 'unstable', trigger: { kind: 'one-shot', at: '2026-07-31T00:00:00.000Z' }, maxRetries: 1, action: () => { attempts += 1; throw new Error('nope'); } });
  await scheduler.tick(new Date('2026-07-31T00:01:00.000Z'));
  assert.equal(attempts, 2);
  assert.equal(scheduler.getDeadLetters()[0].attempts, 2);
});

test('scheduler: concorrência limita schedules simultâneos', async () => {
  const scheduler = new Scheduler(1);
  let resolve;
  const gate = new Promise((done) => { resolve = done; });
  const calls = [];
  scheduler.register({ id: 'a', trigger: { kind: 'one-shot', at: '2026-07-31T00:00:00.000Z' }, maxRetries: 0, action: async () => { calls.push('a'); await gate; } });
  scheduler.register({ id: 'b', trigger: { kind: 'one-shot', at: '2026-07-31T00:00:00.000Z' }, maxRetries: 0, action: () => { calls.push('b'); } });
  const ticking = scheduler.tick(new Date('2026-07-31T00:01:00.000Z'));
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(calls, ['a']);
  resolve();
  await ticking;
  await scheduler.tick(new Date('2026-07-31T00:02:00.000Z'));
  assert.deepEqual(calls, ['a', 'b']);
});

test('event bus: idempotência e sequência sobrevivem ao reinício SQLite', async () => {
  const database = new Database(':memory:');
  new SqliteMigrationRunner(database).apply();
  const first = new EventBus(new SqliteEventStore(database));
  const firstEvent = await first.append({ type: 'execution.completed', aggregateId: 'run-1', payload: { step: 1 }, idempotencyKey: 'run-1-step-1' });
  const duplicate = await first.append({ type: 'execution.completed', aggregateId: 'run-1', payload: { step: 1 }, idempotencyKey: 'run-1-step-1' });
  assert.equal(duplicate.id, firstEvent.id);

  const second = new EventBus(new SqliteEventStore(database));
  const resumed = await second.append({ type: 'execution.completed', aggregateId: 'run-1', payload: { step: 2 }, idempotencyKey: 'run-1-step-2' });
  assert.equal(resumed.sequence, 2);
  assert.equal((await second.list()).length, 2);
  database.close();
});
