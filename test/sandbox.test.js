import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemorySandboxStore, SandboxEngine, SandboxError, runSandboxedCapability } from '../packages/sandbox/src/index.ts';

const runId = 'run-sandbox';
const command = { executable: 'npm', args: ['test'] };

function backend(overrides = {}) {
  const calls = [];
  const value = {
    create: async () => { calls.push('create'); },
    prepare: async () => { calls.push('prepare'); },
    execute: async () => { calls.push('execute'); return { exitCode: 0, stdout: 'ok', stderr: '', durationMs: 3, evidenceIds: ['exec-evidence'] }; },
    validate: async () => { calls.push('validate'); return { status: 'accepted', evidenceIds: ['validate-evidence'], summary: 'valid' }; },
    diff: async () => { calls.push('diff'); return { files: ['src/a.ts'], additions: 2, deletions: 1, evidenceIds: ['diff-evidence'] }; },
    promote: async () => { calls.push('promote'); },
    rollback: async () => { calls.push('rollback'); },
    reject: async () => { calls.push('reject'); },
    destroy: async () => { calls.push('destroy'); },
    ...overrides,
  };
  return { value, calls };
}

test('sandbox: executa ciclo isolado e só promove com diff válido', async () => {
  const store = new InMemorySandboxStore();
  const fixture = backend();
  const engine = new SandboxEngine(store, fixture.value);
  const created = await engine.create({ runId, root: '/tmp/forja-sandbox', correlationId: 'sandbox-test' });
  await assert.rejects(() => engine.execute(created.id, command), SandboxError);
  await engine.prepare(created.id);
  const execution = await engine.execute(created.id, command);
  assert.equal(execution.exitCode, 0);
  const validation = await engine.validate(created.id);
  assert.equal(validation.status, 'accepted');
  const diff = await engine.diff(created.id);
  assert.equal(diff.files[0], 'src/a.ts');
  const promoted = await engine.promote(created.id, diff);
  assert.equal(promoted.state, 'promoted');
  assert.equal(promoted.promoted, true);
  assert.deepEqual(fixture.calls, ['create', 'prepare', 'execute', 'validate', 'diff', 'promote']);
});

test('sandbox: rejeita promoção sem diff e garante destruição explícita', async () => {
  const store = new InMemorySandboxStore();
  const fixture = backend();
  const engine = new SandboxEngine(store, fixture.value);
  const session = await engine.create({ runId, root: '/tmp/forja-sandbox' });
  await engine.prepare(session.id);
  await engine.execute(session.id, command);
  await engine.validate(session.id);
  await assert.rejects(() => engine.promote(session.id, { sessionId: 'other', checksum: 'x' }), SandboxError);
  await engine.reject(session.id);
  const destroyed = await engine.destroy(session.id);
  assert.equal(destroyed.state, 'destroyed');
  assert.equal(destroyed.promoted, false);
  assert.deepEqual(fixture.calls, ['create', 'prepare', 'execute', 'validate', 'reject', 'destroy']);
});

test('sandbox: rollback explícito desfaz promoção e deixa trilha terminal', async () => {
  const store = new InMemorySandboxStore();
  const fixture = backend();
  const engine = new SandboxEngine(store, fixture.value);
  const session = await engine.create({ runId, root: '/tmp/forja-sandbox' });
  await engine.prepare(session.id);
  await engine.execute(session.id, command);
  await engine.validate(session.id);
  const diff = await engine.diff(session.id);
  await engine.promote(session.id, diff);
  const rolledBack = await engine.rollback(session.id, diff);
  assert.equal(rolledBack.state, 'rolled_back');
  assert.equal(rolledBack.promoted, false);
  assert.deepEqual(fixture.calls, ['create', 'prepare', 'execute', 'validate', 'diff', 'promote', 'rollback']);
  await assert.rejects(() => engine.rollback(session.id, diff), SandboxError);
});

test('sandbox: falha de execução não permite continuar para validação', async () => {
  const store = new InMemorySandboxStore();
  const fixture = backend({ execute: async () => { throw new Error('command failed'); } });
  const engine = new SandboxEngine(store, fixture.value);
  const session = await engine.create({ runId, root: '/tmp/forja-sandbox' });
  await engine.prepare(session.id);
  await assert.rejects(() => engine.execute(session.id, command), /command failed/);
  assert.equal((await store.get(session.id)).state, 'failed');
  await assert.rejects(() => engine.validate(session.id), SandboxError);
});

test('runSandboxedCapability: ciclo completo promove e sempre destrói ao final', async () => {
  const store = new InMemorySandboxStore();
  const fixture = backend();
  const engine = new SandboxEngine(store, fixture.value);
  const result = await runSandboxedCapability({
    sandbox: engine,
    runId,
    root: '/tmp/forja-sandbox',
    correlationId: 'sandboxed-capability-test',
    work: async (session) => { await engine.execute(session.id, command); return 'work-done'; },
  });
  assert.equal(result.outcome, 'promoted');
  assert.equal(result.workResult, 'work-done');
  assert.equal(result.session.state, 'destroyed');
  assert.equal(result.diff?.files[0], 'src/a.ts');
  assert.deepEqual(fixture.calls, ['create', 'prepare', 'execute', 'validate', 'diff', 'promote', 'destroy']);
});

test('runSandboxedCapability: validação reprovada rejeita e destrói, sem promover', async () => {
  const store = new InMemorySandboxStore();
  const fixture = backend({ validate: async () => { fixture.calls.push('validate'); return { status: 'rejected', evidenceIds: [], summary: 'nope' }; } });
  const engine = new SandboxEngine(store, fixture.value);
  const result = await runSandboxedCapability({ sandbox: engine, runId, root: '/tmp/forja-sandbox', work: async (session) => { await engine.execute(session.id, command); return 'attempted'; } });
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.workResult, 'attempted');
  assert.equal(result.validation?.status, 'rejected');
  assert.equal(result.session.state, 'destroyed');
  assert.equal(fixture.calls.includes('promote'), false);
});

test('runSandboxedCapability: exceção em work() não promove, faz limpeza best-effort e devolve o erro', async () => {
  const store = new InMemorySandboxStore();
  const fixture = backend();
  const engine = new SandboxEngine(store, fixture.value);
  const result = await runSandboxedCapability({ sandbox: engine, runId, root: '/tmp/forja-sandbox', work: async () => { throw new Error('handler blew up'); } });
  assert.equal(result.outcome, 'failed');
  assert.match(String(result.error), /handler blew up/);
  assert.equal(result.session.state, 'destroyed');
  assert.equal(fixture.calls.includes('promote'), false);
});
