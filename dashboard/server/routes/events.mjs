/**
 * GET /api/events — SSE stream do event bus interno.
 *
 * Frontend abre 1 EventSource e refetcha queries relevantes ao receber eventos.
 */

import { bus } from '../lib/events.mjs';

function sseEvent(name, payload) {
  const lines = JSON.stringify(payload).split('\n').map(l => `data: ${l}`).join('\n');
  return `event: ${name}\n${lines}\n\n`;
}

export default async function eventsRoutes(app) {
  app.get('/api/events', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(sseEvent('hello', { ts: Date.now() }));
    // Heartbeat para detectar conexão morta + keep-alive de proxies.
    const heartbeat = setInterval(() => reply.raw.write(`: keep-alive ${Date.now()}\n\n`), 15000);

    const handler = (evt) => {
      try { reply.raw.write(sseEvent(evt.type, evt)); }
      catch { /* socket fechou — onclose limpa */ }
    };
    bus.on('event', handler);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      bus.off('event', handler);
    });
    return reply;
  });
}
