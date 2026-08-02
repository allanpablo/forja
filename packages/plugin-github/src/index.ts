import type { CapabilityId } from '../../contracts/src/index.ts';
import type { PluginDefinition } from '../../plugin-sdk/src/index.ts';

/** Official manifest-only GitHub integration boundary. Network handlers are injected by the host. */
export const githubPlugin: PluginDefinition = {
  manifest: {
    id: 'forja.github',
    version: '2.0.3',
    capabilities: ['github.issue.list', 'github.pull_request.status'] as CapabilityId[],
    permissions: ['workspace:read', 'capabilities:list', 'capability:execute', 'events:subscribe'],
    events: ['commit.created', 'execution.completed'],
    migrations: [],
    dashboardExtensions: ['github.pull-request'],
    compatibleCore: '^2.0.0',
  },
};
