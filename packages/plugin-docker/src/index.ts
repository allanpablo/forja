import type { CapabilityId } from '../../contracts/src/index.ts';
import type { PluginDefinition } from '../../plugin-sdk/src/index.ts';

/** Official manifest-only Docker integration boundary. The host supplies the sandbox handler. */
export const dockerPlugin: PluginDefinition = {
  manifest: {
    id: 'forja.docker',
    version: '2.0.3',
    capabilities: ['docker.image.inspect', 'docker.container.run'] as CapabilityId[],
    permissions: ['workspace:read', 'capabilities:list', 'capability:execute'],
    events: ['execution.completed', 'agent.blocked'],
    migrations: [],
    dashboardExtensions: ['docker.container'],
    compatibleCore: '^2.0.0',
  },
};
