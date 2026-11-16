/**
 * lib/exec.ts — fronteira de subprocesso portável (SPEC-059).
 *
 * Resolve binários por plataforma (`where`/`which` + PATHEXT), spawnar `.cmd`/`.bat`
 * sem `shell: true` (CVE-2024-27980), launcher de shell portável e kill de árvore.
 * Sem dependência nova: o quoting de cmd.exe é ~30 linhas testadas exaustivamente.
 *
 * Precedente: `hasBinary()` em lib/project-wiring.ts:98.
 */

import { spawn, spawnSync, type ChildProcess, type SpawnOptions, type SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';

const IS_WIN = process.platform === 'win32';

/**
 * Resolve um binário para caminho absoluto, ou null se não encontrável.
 * POSIX: `which`. Windows: `where` + PATHEXT (`.CMD;.BAT;.EXE;…`).
 */
export function resolveCommand(bin: string): string | null {
  if (path.isAbsolute(bin)) return bin;
  const finder = IS_WIN ? 'where' : 'which';
  const r = spawnSync(finder, [bin], { encoding: 'utf8', timeout: 5_000 });
  if (r.status === 0 && r.stdout) {
    const first = r.stdout.trim().split(/\r?\n/)[0];
    if (first) return first;
  }
  if (IS_WIN) {
    const exts = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
    for (const ext of exts) {
      const candidate = `${bin}${ext}`;
      const probe = spawnSync('where', [candidate], { encoding: 'utf8', timeout: 5_000 });
      if (probe.status === 0 && probe.stdout) {
        const first = probe.stdout.trim().split(/\r?\n/)[0];
        if (first) return first;
      }
    }
  }
  return null;
}

/**
 * Escapa um argumento para cmd.exe + parser MSVCRT do processo-filho.
 *
 * Estratégia (a mesma do cross-spawn, sem a dependência):
 * 1. Quoting MSVCRT: envolve em `"`, escapa `"` como `\"`, dobra `\` antes de `"`.
 * 2. Escapa metacaracteres do cmd.exe (`% ^ & | < > ( ) "`) com `^` — fora das aspas
 *    MSVCRT, o `^` é processado pelo parser do cmd.exe antes da expansão de variáveis.
 *
 * Limitação conhecida: `%VAR%` dentro de aspas ainda é expandido pelo cmd.exe se VAR
 * existir no ambiente. Na prática, argumentos de agentes (prompts, flags) raramente
 * contêm padrões `%VAR%` que casem com variáveis reais. O teste AC-2 usa variável
 * inexistente, que o cmd.exe preserva literal.
 */
export function quoteCmdArg(arg: string): string {
  if (arg.length === 0) return '""';
  let s = arg.replace(/(\\*)"/g, '$1$1\\"');
  s = s.replace(/(\\*)$/, '$1$1');
  s = `"${s}"`;
  s = s.replace(/[()%!^"<>&|]/g, '^$&');
  return s;
}

export interface SpawnAgentOptions extends SpawnOptions {
  readonly timeoutMs?: number;
}

/**
 * Spawna um executável de agente de forma portável.
 * - Resolve via resolveCommand (where/which + PATHEXT).
 * - `.cmd`/`.bat` → cmd.exe /d /s /c com quoting próprio (nunca shell: true).
 * - Outros → spawn direto, shell: false.
 * - detached: true em POSIX (process group para killTree); false em Windows.
 */
export function spawnAgent(executable: string, args: readonly string[], opts: SpawnAgentOptions = {}): ChildProcess {
  const resolved = resolveCommand(executable) ?? executable;
  const isCmd = IS_WIN && /\.(cmd|bat)$/i.test(resolved);

  if (isCmd) {
    const comspec = process.env.ComSpec ?? 'cmd.exe';
    const commandLine = `"${resolved}" ${args.map(quoteCmdArg).join(' ')}`;
    return spawn(comspec, ['/d', '/s', '/c', commandLine], {
      ...opts,
      shell: false,
      detached: false,
      windowsVerbatimArguments: true,
    });
  }

  return spawn(resolved, [...args], {
    ...opts,
    shell: false,
    detached: opts.detached ?? !IS_WIN,
  });
}

/**
 * Launcher de shell portável para checks declarativos (`type: 'command'`).
 * POSIX: `sh -c`. Windows: `%ComSpec% /d /s /c`.
 */
export function runShell(command: string, opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): SpawnSyncReturns<string> {
  const shell = IS_WIN ? (process.env.ComSpec ?? 'cmd.exe') : 'sh';
  const shellArgs = IS_WIN ? ['/d', '/s', '/c', command] : ['-c', command];
  return spawnSync(shell, shellArgs, {
    cwd: opts.cwd,
    env: opts.env,
    encoding: 'utf8',
    timeout: opts.timeoutMs ?? 120_000,
  });
}

/**
 * Derruba a árvore de processos.
 * POSIX: kill(-pid, SIGTERM) → grace → kill(-pid, SIGKILL).
 * Windows: taskkill /pid <pid> /T /F (alcança netos de shim .cmd).
 */
export function killTree(pid: number, graceMs = 3_000): void {
  if (IS_WIN) {
    try {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { timeout: 10_000 });
    } catch { /* já morto */ }
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try { process.kill(pid, 'SIGTERM'); } catch { /* já morto */ }
  }
  setTimeout(() => {
    try { process.kill(-pid, 'SIGKILL'); } catch {
      try { process.kill(pid, 'SIGKILL'); } catch { /* já morto */ }
    }
  }, graceMs).unref();
}