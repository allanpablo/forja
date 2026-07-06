/**
 * run-command — spawn seguro de comandos da allowlist.
 *
 * Contrato:
 *  - recebe name (chave da allowlist) + cwd (default: repoRoot)
 *  - valida via allowlist; nome desconhecido → throw CommandNotAllowed
 *  - executa via child_process.spawn SEM shell:true (sem interpolação)
 *  - devolve { proc, stdout, stderr, done }
 *    - proc: ChildProcess
 *    - stdout/stderr: Readable streams (linha-a-linha via setEncoding('utf8'))
 *    - done: Promise<{ code, signal }>
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommand, ALLOWED_NAMES, validateCommandArgs } from './allowlist.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultCwd = path.resolve(__dirname, '..', '..', '..'); // repo root

export class CommandNotAllowed extends Error {
  constructor(name) {
    super(`command not allowlisted: ${name}`);
    this.name = 'CommandNotAllowed';
    this.code = 'COMMAND_NOT_ALLOWED';
    this.requested = name;
    this.allowed = ALLOWED_NAMES;
  }
}

export class CommandArgsInvalid extends Error {
  constructor(name) {
    super(`invalid args for command: ${name}`);
    this.name = 'CommandArgsInvalid';
    this.code = 'COMMAND_ARGS_INVALID';
    this.requested = name;
  }
}

/**
 * @param {string} name
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, signal?: AbortSignal }} [opts]
 */
export function runCommand(name, opts = {}) {
  const entry = getCommand(name);
  if (!entry) throw new CommandNotAllowed(name);
  const extraArgs = validateCommandArgs(name, opts.args || []);
  if (!extraArgs) throw new CommandArgsInvalid(name);

  const cwd = opts.cwd || defaultCwd;
  const env = { ...process.env, ...(opts.env || {}) };

  const args = [...entry.args, ...extraArgs];
  const proc = spawn(entry.cmd, args, {
    cwd,
    env,
    shell: false, // crítico — D4
    stdio: ['ignore', 'pipe', 'pipe'],
    signal: opts.signal,
  });

  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');

  // Engole AbortError do signal — o consumidor verifica via done.signal/code.
  // Outros erros (ENOENT, EACCES) ficam disponíveis em proc.on('error').
  let abortError = null;
  proc.on('error', (err) => {
    if (err && err.name === 'AbortError') abortError = err;
    else throw err;
  });

  const done = new Promise((resolve) => {
    proc.on('close', (code, signal) => resolve({ code, signal, aborted: !!abortError }));
  });

  return {
    proc,
    stdout: proc.stdout,
    stderr: proc.stderr,
    done,
    meta: { name, cmd: entry.cmd, args, cwd },
  };
}
