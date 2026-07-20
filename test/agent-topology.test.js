import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { routerAgents, subAgents, topologyIssues, ENDPOINTS } from '../lib/agent-topology.ts';

/** Repo de fixture: agent-router.ts + .claude/agents + AGENTS.md. */
function fixtureRepo({ router = [], agents = [], agentsMd = '' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-topo-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'scripts', 'agent-router.ts'),
    `const VALID_AGENTS = [${router.map((a) => `'${a}'`).join(', ')}];\n`
  );
  fs.mkdirSync(path.join(root, '.claude', 'agents'), { recursive: true });
  for (const a of agents) fs.writeFileSync(path.join(root, '.claude', 'agents', `${a}.md`), `# ${a}`);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), agentsMd);
  return root;
}
const env = (root) => ({ fs, root });
const clean = (root) => fs.rmSync(root, { recursive: true, force: true });

test('routerAgents extrai o VALID_AGENTS', () => {
  const root = fixtureRepo({ router: ['orchestrator', 'product', 'user'] });
  assert.deepEqual(routerAgents(env(root)), ['orchestrator', 'product', 'user']);
  clean(root);
});

test('subAgents lista .claude/agents, ignora README', () => {
  const root = fixtureRepo({ agents: ['product', 'governance', 'README'] });
  assert.deepEqual(subAgents(env(root)), ['governance', 'product']);
  clean(root);
});

test('topologia coerente → sem issues', () => {
  const root = fixtureRepo({
    router: ['product', 'governance', 'user', 'worker'],
    agents: ['product', 'governance'],
    agentsMd: 'Papéis: product e governance.',
  });
  const iss = topologyIssues(env(root));
  assert.deepEqual(iss, { unrouted: [], missingExecutor: [], undocumented: [] });
  clean(root);
});

test('sub-agent sem rota no router é apontado (o caso release-auditor)', () => {
  const root = fixtureRepo({
    router: ['product', 'user'],
    agents: ['product', 'release-auditor'],
    agentsMd: 'product e release-auditor documentados.',
  });
  assert.deepEqual(topologyIssues(env(root)).unrouted, ['release-auditor']);
  clean(root);
});

test('papel roteável sem executor é apontado', () => {
  const root = fixtureRepo({
    router: ['product', 'sdd-architect', 'user'],
    agents: ['product'],
    agentsMd: 'product e sdd-architect.',
  });
  assert.deepEqual(topologyIssues(env(root)).missingExecutor, ['sdd-architect']);
  clean(root);
});

test('sub-agent não citado no AGENTS.md é apontado', () => {
  const root = fixtureRepo({
    router: ['product', 'marketing'],
    agents: ['product', 'marketing'],
    agentsMd: 'só o product aparece aqui.',
  });
  assert.deepEqual(topologyIssues(env(root)).undocumented, ['marketing']);
  clean(root);
});

test('user e worker são endpoints — não exigem .claude/agent nem doc (AC-2)', () => {
  const root = fixtureRepo({ router: ['user', 'worker'], agents: [], agentsMd: '' });
  const iss = topologyIssues(env(root));
  assert.deepEqual(iss.missingExecutor, [], 'endpoints não precisam de executor');
  assert.ok(ENDPOINTS.has('user') && ENDPOINTS.has('worker'));
  clean(root);
});
