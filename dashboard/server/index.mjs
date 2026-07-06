/**
 * Dashboard server — Fastify bootstrap (T1).
 *
 * Bind em 127.0.0.1 por padrão (kill criterion da spec: nunca expõe rede).
 * Porta default 7777, override via DASHBOARD_PORT.
 *
 * Próximas tasks (T2-T9) registram routes em server/routes/.
 */

import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import specsRoutes from './routes/specs.mjs';
import handoffsRoutes from './routes/handoffs.mjs';
import projectsRoutes from './routes/projects.mjs';
import tokensRoutes from './routes/tokens.mjs';
import commandsRoutes from './routes/commands.mjs';
import briefingRoutes from './routes/briefing.mjs';
import eventsRoutes from './routes/events.mjs';
import agentsRoutes from './routes/agents.mjs';
import docsRoutes from './routes/docs.mjs';
import memoryRoutes from './routes/memory.mjs';
import functionsRoutes from './routes/functions.mjs';
import llmRoutingRoutes from './routes/llm-routing.mjs';
import workflowRoutes from './routes/workflow.mjs';
import stacksRoutes from './routes/stacks.mjs';
import systemRoutes from './routes/system.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRepoRoot = path.resolve(__dirname, '..', '..');

const HOST = process.env.DASHBOARD_HOST || '127.0.0.1';
const PORT = Number(process.env.DASHBOARD_PORT || 7777);

export function buildServer({ logger = true, repoRoot = defaultRepoRoot } = {}) {
  const app = Fastify({
    logger: logger ? { level: 'info' } : false,
    disableRequestLogging: !logger,
  });

  app.get('/api/health', async () => ({
    ok: true,
    service: 'agent-dashboard',
    version: '0.1.0',
    repoRoot,
    time: new Date().toISOString(),
  }));

  app.register(specsRoutes, { repoRoot });
  app.register(handoffsRoutes, { repoRoot });
  app.register(projectsRoutes, { repoRoot });
  app.register(tokensRoutes, { repoRoot });
  app.register(commandsRoutes, { repoRoot });
  app.register(briefingRoutes, { repoRoot });
  app.register(eventsRoutes);
  app.register(agentsRoutes, { repoRoot });
  app.register(docsRoutes, { repoRoot });
  app.register(memoryRoutes, { repoRoot });
  app.register(functionsRoutes);
  app.register(llmRoutingRoutes, { repoRoot });
  app.register(workflowRoutes, { repoRoot });
  app.register(stacksRoutes, { repoRoot });
  app.register(systemRoutes, { repoRoot });

  // Servir SPA buildada de dashboard/web/dist (T9). Se ainda não foi buildada,
  // expõe um placeholder explicando como subir o dev server.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const distDir = path.resolve(__dirname, '..', 'web', 'dist');
  if (fs.existsSync(distDir)) {
    app.register(fastifyStatic, { root: distDir, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not Found' });
      return reply.sendFile('index.html');
    });
  } else {
    app.get('/', async () => ({
      message: 'SPA não buildada. Rode `npm run dashboard:web:build` ou `npm run dev` em dashboard/web/.',
      api: '/api/health',
    }));
  }

  return app;
}

export { defaultRepoRoot as repoRoot };

async function main() {
  const app = buildServer();
  try {
    const addr = await app.listen({ host: HOST, port: PORT });
    app.log.info(`Dashboard ready at ${addr}/api/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
