/**
 * lib/core/journey.ts — a jornada do usuário, executada de verdade (ADR-0086).
 *
 * Os checks de consumidor do release (spec:new, project:check, gsd:*) nasceram um por bug e
 * provavam cada peça isolada. Nenhum provava o que o usuário de fato faz: criar um projeto e
 * trabalhar nele com uma IA. Foi nessa lacuna que a v4 saiu com `project:new` gerando projetos
 * sem instruções, scripts apontando para arquivos ausentes e `context:smart` sem modo task.
 *
 * `runJourney` cria workspace e projeto num HOME descartável e percorre o caminho feliz dentro do
 * projeto — memória, contexto, specs, gates, hooks e MCP —, conferindo o EFEITO de cada passo, não
 * só o exit code. Roda contra o fonte (`npm test`) e contra o pacote instalado (`release:check`).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface JourneyStep {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** Assinatura (caminho → mtime+tamanho) dos arquivos do pacote — para provar que a jornada não o tocou. */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === '.context') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { const st = fs.statSync(p); out.set(path.relative(dir, p), `${st.mtimeMs}:${st.size}`); }
    }
  };
  walk(dir);
  return out;
}

export interface JourneyOptions {
  /** Entry point do forja: `bin/forja.ts` (fonte) ou `<pkg>/dist/bin/forja.js` (instalado). */
  readonly bin: string;
  /** Raiz do pacote do Forja em teste: nada nela pode mudar durante a jornada. */
  readonly pkgDir: string;
  /** Versão esperada no handshake do MCP. */
  readonly version: string;
  /** Diretório base descartável; criado e removido se omitido. */
  readonly baseDir?: string;
  /** Mantém o diretório para inspeção (debug). */
  readonly keep?: boolean;
}

const LOADER_ERRORS = /ERR_MODULE_NOT_FOUND|ERR_DLOPEN_FAILED|Cannot find module|ERR_PACKAGE_PATH_NOT_EXPORTED|TypeError|ReferenceError/;

export function runJourney(opts: JourneyOptions): JourneyStep[] {
  const base = opts.baseDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'forja-journey-'));
  const home = path.join(base, 'home');
  fs.mkdirSync(home, { recursive: true });

  // Usuário real: HOME próprio, sem FORJA_* nem npm_* herdados (o mesmo isolamento do release).
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home };
  for (const k of Object.keys(env)) if (k.startsWith('FORJA_') || k.startsWith('npm_') || k === 'NODE_PATH') delete env[k];

  const steps: JourneyStep[] = [];
  const add = (id: string, ok: boolean, detail: string) => steps.push({ id, ok, detail });
  const forja = (args: string[], cwd: string, input?: string) => {
    const r = spawnSync(process.execPath, [opts.bin, ...args], { cwd, env, input, encoding: 'utf8', timeout: 180_000 });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    return { code: r.status ?? 1, out, stdout: r.stdout || '' };
  };
  const firstLine = (s: string) => s.trim().split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 300);
  const clean = (r: { out: string }) => !LOADER_ERRORS.test(r.out);

  const before = snapshot(opts.pkgDir);
  try {
    const ws = path.join(home, 'forja-workspace');
    const proj = path.join(ws, 'projects', 'jornada');

    let r = forja(['workspace:init'], home);
    add('workspace:init', r.code === 0 && fs.existsSync(path.join(ws, 'projects')), firstLine(r.out));

    r = forja(['project:new', 'jornada', '--ai', 'claude,codex,gemini,copilot', '--skip-backend'], home);
    add('project:new', r.code === 0 && clean(r) && fs.existsSync(path.join(proj, 'AGENTS.md')), r.code === 0 ? 'projeto gerado' : firstLine(r.out));
    if (!fs.existsSync(proj)) return steps;

    r = forja(['project:wire', '--check', '--json'], proj);
    let wiring: any = null;
    try { wiring = JSON.parse(r.stdout); } catch { /* reportado abaixo */ }
    const wiringFails = (wiring?.checks ?? []).filter((c: any) => c.status === 'fail').map((c: any) => `${c.id}: ${c.detail}`);
    add('project:wire', r.code === 0 && wiring?.ok === true, wiring ? (wiringFails.join('; ') || `${wiring.checks.length} checks ok`) : firstLine(r.out));

    r = forja(['status'], proj);
    add('status', r.code === 0 && /memória indexada: sim/.test(r.out), /memória indexada: sim/.test(r.out) ? 'memória indexada de nascença' : firstLine(r.out));

    r = forja(['spec:new', 'pagamentos'], proj);
    const spec = path.join(proj, 'specs', 'pagamentos', 'spec.md');
    const specOk = fs.existsSync(spec) && /\*\*ID\*\*:\s*SPEC-001/.test(fs.readFileSync(spec, 'utf8'));
    add('spec:new', r.code === 0 && specOk, specOk ? 'specs/pagamentos/spec.md (SPEC-001)' : firstLine(r.out));

    r = forja(['sync:universal'], proj);
    add('sync:universal', r.code === 0 && clean(r), firstLine(r.out));

    r = forja(['query:universal', 'pagamentos'], proj);
    add('query:universal', r.code === 0 && /\[Projeto: jornada\]/.test(r.out), /\[Projeto: jornada\]/.test(r.out) ? 'acha a spec do projeto' : firstLine(r.out));

    r = forja(['context:smart', '--mode', 'task', '--task', 'pagamentos'], proj);
    const pack = path.join(proj, '.context', 'smart-context.md');
    const packOk = fs.existsSync(pack) && fs.readFileSync(pack, 'utf8').includes('specs/pagamentos/spec.md');
    add('context:smart', r.code === 0 && packOk, packOk ? 'modo task inclui a spec' : firstLine(r.out));

    r = forja(['spec:check'], proj);
    add('spec:check', r.code === 0 && /pagamentos/.test(r.out), firstLine(r.out));

    r = forja(['project:check'], proj);
    add('project:check', r.code === 0, firstLine(r.out));

    r = forja(['tools:doctor'], proj);
    add('tools:doctor', r.code === 0 && /Projeto —/.test(r.out), firstLine(r.out));

    r = forja(['hook:session-start'], proj, '{}');
    let ctx = '';
    try { ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext; } catch { /* reportado abaixo */ }
    add('hook:session-start', r.code === 0 && ctx.includes('pagamentos'), ctx ? 'briefing cita a spec ativa' : firstLine(r.out));

    r = forja(['hook:user-prompt'], proj, JSON.stringify({ prompt: 'implementar a spec pagamentos' }));
    ctx = '';
    try { ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext; } catch { /* reportado abaixo */ }
    add('hook:user-prompt', r.code === 0 && ctx.includes('specs/pagamentos/spec.md'), ctx ? 'injeta a spec citada' : firstLine(r.out));

    const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'journey', version: '1' } } });
    r = forja(['mcp:start'], proj, `${init}\n`);
    let version = '';
    try { version = JSON.parse(r.stdout.split('\n').find((l) => l.includes('"id":1')) ?? '').result.serverInfo.version; } catch { /* reportado abaixo */ }
    add('mcp:start', version === opts.version, version ? `serverInfo.version ${version}` : firstLine(r.out));

    // Comandos que escreviam no pacote quando rodados num projeto (v4): agora gravam no projeto.
    r = forja(['project:dashboard'], proj);
    add('project:dashboard', r.code === 0 && fs.existsSync(path.join(proj, 'DASHBOARD-PROGRESSO.md')), firstLine(r.out));
    r = forja(['memory:extract'], proj);
    add('memory:extract', r.code === 0 && fs.existsSync(path.join(proj, 'memory', '00-global', 'shared-knowledge.md')), firstLine(r.out));

    return steps;
  } finally {
    // Classe de bug da v1.6.1/v1.7.0/v4: comando rodado no projeto escrevendo dentro do pacote.
    const after = snapshot(opts.pkgDir);
    const touched = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k));
    add('pacote-intocado', touched.length === 0, touched.length ? `a jornada alterou o pacote: ${touched.slice(0, 8).join(', ')}` : 'nenhum arquivo do pacote mudou');
    if (!opts.keep && !opts.baseDir) fs.rmSync(base, { recursive: true, force: true });
  }
}
