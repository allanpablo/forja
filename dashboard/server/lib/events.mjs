/**
 * Event bus do dashboard.
 *
 * Backend publica eventos de mutação (handoffs, specs, comandos) no bus;
 * `routes/events.mjs` expõe via SSE; SPA subscribes para refetch realtime.
 *
 * Tipos:
 *   command.started    { source, name, cmd, args }
 *   command.stdout     { source, line }
 *   command.stderr     { source, line }
 *   command.exit       { source, code, signal? }
 *   handoff.transitioned { id, from?: status, to: status }
 *   spec.created       { slug }
 *   spec.status_changed { slug, from, to }
 */

import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

export const bus = new EventEmitter();
bus.setMaxListeners(100);

export function publish(type, payload = {}) {
  bus.emit('event', { type, ts: Date.now(), ...payload });
}

export function newSource() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Spawn que publica command.started/stdout/stderr/exit no bus.
 * Mesma assinatura ergonômica que existia inline em briefing/handoffs.
 *
 * Sem shell:true (ADR-0009).
 */
export function spawnWithEvents(cmd, args, { cwd, name, source } = {}) {
  source = source || newSource();
  name = name || `${cmd} ${args[0] || ''}`.trim();
  publish('command.started', { source, name, cmd, args });
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      out += chunk;
      for (const line of chunk.split(/\r?\n/)) if (line) publish('command.stdout', { source, line });
    });
    proc.stderr.on('data', (chunk) => {
      err += chunk;
      for (const line of chunk.split(/\r?\n/)) if (line) publish('command.stderr', { source, line });
    });
    proc.on('error', (e) => {
      publish('command.stderr', { source, line: `spawn error: ${e.message}` });
    });
    proc.on('close', (code, signal) => {
      publish('command.exit', { source, code, signal });
      resolve({ code, signal, stdout: out, stderr: err, source });
    });
  });
}
