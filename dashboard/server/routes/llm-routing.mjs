import { publish } from '../lib/events.mjs';
import { PROVIDERS, readRouting, routingPath, writeAssignment } from '../lib/llm-routing.mjs';

const ROLE_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PROVIDER_IDS = new Set(PROVIDERS.map(p => p.id));

export default async function llmRoutingRoutes(app, { repoRoot }) {
  app.get('/api/llm-routing', async () => ({
    path: routingPath(repoRoot).replace(`${repoRoot}/`, ''),
    providers: PROVIDERS,
    ...readRouting(repoRoot),
  }));

  app.post('/api/llm-routing/:role', async (req, reply) => {
    const role = String(req.params.role || '').trim().toLowerCase();
    if (!ROLE_RE.test(role)) {
      return reply.code(400).send({ error: 'invalid role', code: 'INVALID_ROLE' });
    }
    const provider = String(req.body?.provider || '').trim();
    if (!PROVIDER_IDS.has(provider)) {
      return reply.code(400).send({ error: 'invalid provider', code: 'INVALID_PROVIDER' });
    }
    const assignment = writeAssignment(repoRoot, role, req.body || {});
    publish('llm.routing_updated', { role, assignment });
    return { role, assignment };
  });
}
