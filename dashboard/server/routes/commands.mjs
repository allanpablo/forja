/**
 * POST /api/commands/:name → SSE com eventos do comando da allowlist.
 * GET  /api/commands      → lista nomes permitidos (read-only, sem disparo).
 *
 * Eventos SSE:
 *   event: stdout   data: <linha>
 *   event: stderr   data: <linha>
 *   event: exit     data: { code, signal, aborted }
 *
 * Plan §4 + ADR-0009 (RCE mitigation).
 */

import { runCommand, CommandNotAllowed, CommandArgsInvalid } from '../lib/run-command.mjs';
import { COMMAND_ALLOWLIST, ALLOWED_NAMES, isAllowed } from '../lib/allowlist.mjs';
import { sseEvent } from '../lib/sse.mjs';

export default async function commandsRoutes(app, { repoRoot }) {
  app.get('/api/commands', async () => ({
    allowed: ALLOWED_NAMES.map(name => ({
      name,
      description: COMMAND_ALLOWLIST[name].description,
      acceptsArgs: COMMAND_ALLOWLIST[name].acceptsArgs,
      argsSchema: argsSchemaHint(name),
    })),
  }));

  app.post('/api/commands/:name', async (req, reply) => {
    const { name } = req.params;
    if (!isAllowed(name)) {
      return reply.code(403).send({
        error: 'command not allowlisted',
        code: 'COMMAND_NOT_ALLOWED',
        requested: name,
        allowed: ALLOWED_NAMES,
      });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let stream;
    const bodyArgs = Array.isArray(req.body?.args) ? req.body.args : [];
    try { stream = runCommand(name, { cwd: repoRoot, args: bodyArgs }); }
    catch (err) {
      if (err instanceof CommandNotAllowed) {
        reply.raw.write(sseEvent('exit', { code: -1, error: 'not_allowed' }));
        reply.raw.end();
        return reply;
      }
      if (err instanceof CommandArgsInvalid) {
        reply.raw.write(sseEvent('exit', { code: -1, error: 'invalid_args' }));
        reply.raw.end();
        return reply;
      }
      throw err;
    }

    const { stdout, stderr, done, meta } = stream;
    reply.raw.write(sseEvent('start', { name: meta.name, cmd: meta.cmd, args: meta.args }));

    function pipeChunk(eventName, chunk) {
      // chunk pode ter múltiplas linhas; emite cada uma como evento próprio.
      const lines = String(chunk).split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i === lines.length - 1 && line === '') continue;
        reply.raw.write(sseEvent(eventName, line));
      }
    }
    stdout.on('data', c => pipeChunk('stdout', c));
    stderr.on('data', c => pipeChunk('stderr', c));

    const result = await done;
    reply.raw.write(sseEvent('exit', result));
    reply.raw.end();
    return reply;
  });
}

function argsSchemaHint(name) {
  return {
    'gsd:plan': ['slug', 'objetivo opcional'],
    'gsd:handoff': ['spec|plan|implement|review', 'slug', 'contexto opcional'],
    'gsd:check': ['slug', 'brief.md opcional'],
    'design:select': ['agent-console|dashboard|docs|landing|tool|fintech|premium', 'tom opcional'],
    'design:check': ['brief.md'],
    'context:build': ['global|domain|task', 'slug', 'keyword opcional'],
  }[name] || [];
}
