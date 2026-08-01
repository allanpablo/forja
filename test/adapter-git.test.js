import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitWorktreeBackend } from '../packages/adapter-git/src/index.ts';

test('adapter-git: traduz ciclo para comandos Git e aplica patch somente na promoção', async () => {
  const calls = [];
  const runner = { run: async (command) => {
    calls.push(command);
    if (command.args.includes('--numstat')) return { exitCode: 0, stdout: '2\t1\tsrc/a.ts\n', stderr: '', durationMs: 1 };
    if (command.args.includes('--name-only')) return { exitCode: 0, stdout: 'src/a.ts\n', stderr: '', durationMs: 1 };
    if (command.args.includes('--binary')) return { exitCode: 0, stdout: 'binary patch', stderr: '', durationMs: 1 };
    return { exitCode: 0, stdout: '', stderr: '', durationMs: 1 };
  }};
  const patches = [];
  const backend = new GitWorktreeBackend(runner, { repositoryRoot: '/repo', sourceRef: 'HEAD', patchApplier: { apply: async (root, patch) => patches.push({ root, patch }) } });
  const session = { id: 'sandbox-1', runId: 'run-1', backend: 'git_worktree', root: '/tmp/worktree', state: 'created', promoted: false, schemaVersion: '2.0', createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z', correlationId: 'test' };
  await backend.create(session);
  await backend.prepare(session);
  await backend.execute(session, { executable: 'npm', args: ['test'] });
  assert.equal((await backend.validate(session)).status, 'accepted');
  const diff = await backend.diff(session);
  assert.deepEqual(diff.files, ['src/a.ts']);
  assert.equal(diff.additions, 2);
  assert.equal(diff.deletions, 1);
  await backend.promote(session);
  assert.deepEqual(patches, [{ root: '/repo', patch: 'binary patch' }]);
  assert.equal(calls[0].executable, 'git');
  assert.deepEqual(calls[0].args, ['-C', '/repo', 'worktree', 'add', '--detach', '/tmp/worktree', 'HEAD']);
});
