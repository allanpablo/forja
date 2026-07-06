import { spawnWithEvents, publish, newSource } from './events.mjs';

export async function syncUniversal(repoRoot, reason = 'mutation', { projectSlug = null, includeGlobal = false } = {}) {
  const source = newSource();
  const args = ['scripts/sync-universal-memory.js'];
  if (projectSlug) {
    args.push('--project', projectSlug);
    if (includeGlobal) args.push('--global');
  }
  const result = await spawnWithEvents('node', args, {
    cwd: repoRoot,
    name: `sync-universal-memory ${reason}`,
    source,
  });
  publish('memory.synced', { reason, source, code: result.code, projectSlug });
  return { ...result, source, projectSlug };
}
