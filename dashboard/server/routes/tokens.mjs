/**
 * GET /api/tokens?project=<name|__framework__>&days=30
 *
 * Devolve série temporal estimada (chars/4) de tokens consumidos por contexto.
 * Sem `project`: agrega framework + todos os projetos.
 * Plan §4 e D7.
 */

import { estimateTokens } from '../lib/token-estimator.mjs';

const NAME_RE = /^(?:__framework__|[a-zA-Z0-9_-]+)$/;

export default async function tokensRoutes(app, { repoRoot }) {
  app.get('/api/tokens', async (req, reply) => {
    const { project, days = '30' } = req.query || {};
    if (project && !NAME_RE.test(project)) {
      return reply.code(400).send({ error: 'invalid project', code: 'INVALID_PROJECT' });
    }
    const parsedDays = parseInt(days, 10);
    if (!parsedDays || parsedDays < 1 || parsedDays > 365) {
      return reply.code(400).send({ error: 'days must be 1..365', code: 'INVALID_DAYS' });
    }
    const result = await estimateTokens(repoRoot, { project: project || null, days: parsedDays });
    return result;
  });
}
