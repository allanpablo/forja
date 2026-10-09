/**
 * lib/project-wiring.ts — liga um projeto à inteligência do Forja (ADR-0086).
 *
 * Um projeto gerado só é "Forja" se a IA que o abre enxergar o processo: instruções nativas que
 * cada ferramenta lê sozinha, hooks que trazem o estado na abertura da sessão, sub-agents por papel
 * e o MCP do Forja. Antes da v5 nada disso era emitido — as instruções iam para `.ia-instructions/`
 * (que nenhuma IA lê), copiadas do texto do FRAMEWORK (com `npm run` que não existe no projeto).
 *
 * Duas faces da mesma fonte de verdade:
 *   - `wireProject`        escreve/atualiza (idempotente; preserva conteúdo do usuário).
 *   - `checkProjectWiring` verifica, incluindo que todo `forja <cmd>` citado existe no registry e
 *                          que todo `node <arquivo>` dos package.json aponta para arquivo real.
 *
 * Conteúdo gerenciado em Markdown vive entre `<!-- forja:begin -->` e `<!-- forja:end -->`: o
 * wire reescreve só o bloco, o resto do arquivo é do usuário.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { asset } from './paths.ts';

export const BEGIN = '<!-- forja:begin -->';
export const END = '<!-- forja:end -->';
const AGENT_MARK = '<!-- forja:managed -->';

export const SUPPORTED_AI = ['claude', 'codex', 'gemini', 'copilot'] as const;
/** Onde cada IA lê as instruções nativamente. */
export const INSTRUCTION_FILE: Readonly<Record<string, string>> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md',
  copilot: '.github/copilot-instructions.md',
};

const CODEX_MCP = '# Forja — servidor MCP (forja project:wire)\n[mcp_servers.forja]\ncommand = "forja"\nargs = ["mcp:start"]\n';

const GITIGNORE = ['memory/sqlite/', '.context/'];

export const ROLES = ['orchestrator', 'product', 'sdd-architect', 'context-engineer', 'governance', 'marketing'] as const;

/** Hooks do Claude Code. Guardados por `command -v`: sem `forja` no PATH, a sessão abre sem erro. */
export const HOOKS: Readonly<Record<string, string>> = {
  SessionStart: 'hook:session-start',
  UserPromptSubmit: 'hook:user-prompt',
};

export function hookCommand(cmd: string): string {
  return `command -v forja >/dev/null 2>&1 && forja ${cmd} || true`;
}

export interface WireOptions {
  /** IAs a conectar. AGENTS.md é sempre escrito (Codex, Copilot agent e Gemini o leem). */
  ai?: readonly string[];
  /** Registrar o codegraph no .mcp.json. Padrão: só se o binário estiver no PATH. */
  codegraph?: boolean;
}

export interface WireChange {
  readonly file: string;
  readonly action: 'created' | 'updated' | 'unchanged';
}

function template(rel: string): string {
  return fs.readFileSync(asset('templates', 'project', rel), 'utf8').trimEnd();
}

function hasBinary(bin: string): boolean {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0;
}

/** Substitui (ou acrescenta) o bloco gerenciado preservando o resto do arquivo. */
export function upsertManagedBlock(existing: string | null, body: string): string {
  const block = `${BEGIN}\n${body.trimEnd()}\n${END}`;
  if (existing == null || existing.trim() === '') return `${block}\n`;
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);
  if (start !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + END.length);
  }
  return `${block}\n\n${existing.trimStart()}`;
}

function readOrNull(file: string): string | null {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function readJson(file: string): any {
  const raw = readOrNull(file);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { throw new Error(`${file} não é JSON válido — corrija antes de rodar project:wire`); }
}

function write(dir: string, rel: string, content: string, changes: WireChange[]) {
  const file = path.join(dir, rel);
  const before = readOrNull(file);
  if (before === content) { changes.push({ file: rel, action: 'unchanged' }); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  changes.push({ file: rel, action: before == null ? 'created' : 'updated' });
}

function writeJson(dir: string, rel: string, data: unknown, changes: WireChange[]) {
  write(dir, rel, `${JSON.stringify(data, null, 2)}\n`, changes);
}

function normalizeAi(ai: readonly string[] | undefined): string[] {
  const list = (ai && ai.length ? ai : SUPPORTED_AI).map((a) => a.trim().toLowerCase()).filter(Boolean);
  const unknown = list.filter((a) => !(SUPPORTED_AI as readonly string[]).includes(a));
  if (unknown.length) throw new Error(`IA desconhecida: ${unknown.join(', ')} (suportadas: ${SUPPORTED_AI.join(', ')})`);
  return [...new Set(list)];
}

/** IAs já conectadas a um projeto, deduzidas dos arquivos nativos (para `project:wire` sem `--ai`). */
export function detectWiredAi(dir: string): string[] {
  try {
    const chain = JSON.parse(fs.readFileSync(path.join(dir, '.forja', 'models.json'), 'utf8')).fallback_chain;
    if (Array.isArray(chain) && chain.length) return chain.filter((a: string) => (SUPPORTED_AI as readonly string[]).includes(a));
  } catch { /* sem models.json: deduz pelos arquivos */ }
  const found: string[] = [];
  if (fs.existsSync(path.join(dir, 'CLAUDE.md')) || fs.existsSync(path.join(dir, '.claude'))) found.push('claude');
  if (fs.existsSync(path.join(dir, 'AGENTS.md'))) found.push('codex');
  if (fs.existsSync(path.join(dir, 'GEMINI.md'))) found.push('gemini');
  if (fs.existsSync(path.join(dir, '.github', 'copilot-instructions.md'))) found.push('copilot');
  // Projetos pré-v5 registravam as IAs só em .ia-instructions/<ai>.md.
  const legacy = path.join(dir, '.ia-instructions');
  if (fs.existsSync(legacy)) {
    for (const ai of SUPPORTED_AI) if (fs.existsSync(path.join(legacy, `${ai}.md`))) found.push(ai);
  }
  return [...new Set(found)];
}

const HARNESS_SCRIPTS: Readonly<Record<string, string>> = {
  'code:check': 'forja code:check',
  'code:impact': 'forja code:impact',
  'tools:doctor': 'forja tools:doctor',
};
/** Scripts emitidos por versões antigas que apontavam para arquivos que nunca chegavam ao projeto. */
const LEGACY_SCRIPT_RE = /^node scripts\/(code-intel|tools-doctor)\.mjs\b/;

/** Escreve/atualiza a conexão do projeto. Idempotente. */
export function wireProject(dir: string, opts: WireOptions = {}): WireChange[] {
  const ai = normalizeAi(opts.ai);
  const changes: WireChange[] = [];
  const agentsBody = template('AGENTS.md');

  write(dir, 'AGENTS.md', upsertManagedBlock(readOrNull(path.join(dir, 'AGENTS.md')), agentsBody), changes);

  if (ai.includes('claude')) {
    write(dir, 'CLAUDE.md', upsertManagedBlock(readOrNull(path.join(dir, 'CLAUDE.md')), template('CLAUDE.md')), changes);

    const settingsRel = path.join('.claude', 'settings.json');
    const settings = readJson(path.join(dir, settingsRel)) ?? {};
    settings.hooks ??= {};
    for (const [event, cmd] of Object.entries(HOOKS)) {
      const groups: any[] = (settings.hooks[event] ??= []);
      const wired = groups.some((g) => (g.hooks || []).some((h: any) => String(h.command || '').includes(`forja ${cmd}`)));
      if (!wired) groups.push({ hooks: [{ type: 'command', command: hookCommand(cmd), timeout: 10 }] });
    }
    settings.permissions ??= {};
    const allow: string[] = (settings.permissions.allow ??= []);
    if (!allow.includes('Bash(forja *)')) allow.push('Bash(forja *)');
    writeJson(dir, settingsRel, settings, changes);

    for (const role of ROLES) {
      const rel = path.join('.claude', 'agents', `${role}.md`);
      const current = readOrNull(path.join(dir, rel));
      // Sub-agent editado à mão (sem a marca) é do usuário: não sobrescreve.
      if (current != null && !current.includes(AGENT_MARK)) { changes.push({ file: rel, action: 'unchanged' }); continue; }
      write(dir, rel, `${template(path.join('agents', `${role}.md`))}\n\n${AGENT_MARK}\n`, changes);
    }
  }

  if (ai.includes('gemini')) {
    write(dir, 'GEMINI.md', upsertManagedBlock(readOrNull(path.join(dir, 'GEMINI.md')), '@AGENTS.md'), changes);
  }
  if (ai.includes('copilot')) {
    const rel = path.join('.github', 'copilot-instructions.md');
    write(dir, rel, upsertManagedBlock(readOrNull(path.join(dir, rel)), agentsBody), changes);
  }

  // Artefatos locais nunca vão para o git: o índice SQLite e os packs/auditoria em .context/.
  const giPath = path.join(dir, '.gitignore');
  const gi = readOrNull(giPath) ?? '';
  const giLines = new Set(gi.split('\n').map((l) => l.trim()));
  const missingIgnores = GITIGNORE.filter((l) => !giLines.has(l));
  if (missingIgnores.length) {
    write(dir, '.gitignore', `${gi}${gi && !gi.endsWith('\n') ? '\n' : ''}${gi ? '\n' : ''}# Forja — artefatos locais\n${missingIgnores.join('\n')}\n`, changes);
  }

  // Cadeia de fallback entre IAs (protocolo "Engine Switch" de memory/00-global/context-policy.md).
  // Toda IA lê as mesmas instruções (AGENTS.md); o arquivo diz a ordem e onde cada uma as encontra.
  const modelsRel = path.join('.forja', 'models.json');
  const prevModels = (() => { try { return readJson(path.join(dir, modelsRel)); } catch { return null; } })();
  writeJson(dir, modelsRel, {
    active_engine: prevModels?.active_engine && ai.includes(prevModels.active_engine) ? prevModels.active_engine : ai[0],
    fallback_chain: ai,
    engines: Object.fromEntries(ai.map((a) => [a, { instruction_file: INSTRUCTION_FILE[a], status: 'ready' }])),
  }, changes);

  // MCP: o servidor do próprio Forja sempre; codegraph só se existir (senão a IA vê um MCP quebrado).
  const mcp = readJson(path.join(dir, '.mcp.json')) ?? {};
  mcp.mcpServers ??= {};
  mcp.mcpServers.forja ??= { type: 'stdio', command: 'forja', args: ['mcp:start'], env: {} };
  const withCodegraph = opts.codegraph ?? hasBinary('codegraph');
  if (withCodegraph) mcp.mcpServers.codegraph ??= { type: 'stdio', command: 'codegraph', args: ['serve', '--mcp'], env: {} };
  else if (mcp.mcpServers.codegraph && !hasBinary('codegraph')) delete mcp.mcpServers.codegraph;
  writeJson(dir, '.mcp.json', mcp, changes);

  // O mesmo servidor nas outras IAs, cada uma na config de projeto que ela lê sozinha.
  if (ai.includes('codex')) {
    const rel = path.join('.codex', 'config.toml');
    const toml = readOrNull(path.join(dir, rel)) ?? '';
    if (!/^\[mcp_servers\.forja\]/m.test(toml)) {
      write(dir, rel, `${toml}${toml && !toml.endsWith('\n') ? '\n' : ''}${toml ? '\n' : ''}${CODEX_MCP}`, changes);
    } else changes.push({ file: rel, action: 'unchanged' });
  }
  if (ai.includes('gemini')) {
    const rel = path.join('.gemini', 'settings.json');
    const gem = readJson(path.join(dir, rel)) ?? {};
    gem.mcpServers ??= {};
    gem.mcpServers.forja ??= { command: 'forja', args: ['mcp:start'] };
    writeJson(dir, rel, gem, changes);
  }
  if (ai.includes('copilot')) {
    const rel = path.join('.vscode', 'mcp.json');
    const vs = readJson(path.join(dir, rel)) ?? {};
    vs.servers ??= {};
    vs.servers.forja ??= { type: 'stdio', command: 'forja', args: ['mcp:start'] };
    writeJson(dir, rel, vs, changes);
  }

  const pkgPath = path.join(dir, 'package.json');
  const pkg = readJson(pkgPath) ?? { name: path.basename(dir), version: '0.1.0', private: true, type: 'module' };
  pkg.scripts ??= {};
  for (const [key, value] of Object.entries(HARNESS_SCRIPTS)) {
    if (!pkg.scripts[key] || LEGACY_SCRIPT_RE.test(pkg.scripts[key])) pkg.scripts[key] = value;
  }
  writeJson(dir, 'package.json', pkg, changes);

  // Backend pré-v5: memory:db:* apontavam para memory-db-*.mjs, que nunca foram gerados.
  const backendPkgPath = path.join(dir, 'backend', 'package.json');
  const backendPkg = readJson(backendPkgPath);
  if (backendPkg?.scripts) {
    const s = backendPkg.scripts;
    const dead = (k: string) => typeof s[k] === 'string' && /scripts\/memory-db-\w+\.mjs/.test(s[k])
      && !fs.existsSync(path.join(dir, 'backend', s[k].replace(/^node\s+/, '').split(/\s/)[0]));
    const migrate = ['memory:db:init', 'memory:db:sync', 'memory:db:query'].filter(dead);
    if (migrate.includes('memory:db:init')) delete s['memory:db:init'];
    if (migrate.includes('memory:db:sync')) s['memory:db:sync'] = 'cd .. && forja sync:universal';
    if (migrate.includes('memory:db:query')) s['memory:db:query'] = 'cd .. && forja query:universal';
    // Só reescreve quando migrou algo: o package.json do backend é do usuário.
    if (migrate.length) write(dir, path.join('backend', 'package.json'), `${JSON.stringify(backendPkg, null, 2)}\n`, changes);
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Verificação
// ---------------------------------------------------------------------------

export interface WiringCheck {
  readonly id: string;
  readonly status: 'ok' | 'warn' | 'fail';
  readonly detail: string;
}

/** Todo `forja <comando>` citado num texto (blocos de código e inline). */
export function citedForjaCommands(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:^|[\s`(&|;])forja ([a-z][a-z0-9-]*(?::[a-z0-9-]+)*)/gm)) out.add(m[1]);
  return [...out];
}

/** `node <arquivo>` dos scripts de um package.json cujo arquivo não existe. */
export function brokenNodeScripts(pkgDir: string): string[] {
  const pkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')); } catch { return null; } })();
  if (!pkg?.scripts) return [];
  const broken: string[] = [];
  for (const [name, cmd] of Object.entries<string>(pkg.scripts)) {
    for (const m of String(cmd).matchAll(/(?:^|&&\s*|;\s*)node\s+(?:--[\w-]+(?:=\S+)?\s+)*([^\s-][^\s]*\.(?:m?js|cjs|ts))/g)) {
      if (!fs.existsSync(path.resolve(pkgDir, m[1]))) broken.push(`${name} → ${m[1]}`);
    }
  }
  return broken;
}

export function checkProjectWiring(dir: string, { commands, ai }: { commands: Record<string, unknown>; ai?: readonly string[] }): WiringCheck[] {
  const checks: WiringCheck[] = [];
  const wiredAi = ai && ai.length ? normalizeAi(ai) : detectWiredAi(dir);
  const add = (id: string, status: WiringCheck['status'], detail: string) => checks.push({ id, status, detail });

  const agents = readOrNull(path.join(dir, 'AGENTS.md'));
  if (!agents?.includes(BEGIN)) add('instructions', 'fail', 'AGENTS.md sem o bloco do Forja — rode: forja project:wire');
  else add('instructions', 'ok', 'AGENTS.md com o bloco do Forja');

  if (wiredAi.includes('claude')) {
    const claude = readOrNull(path.join(dir, 'CLAUDE.md'));
    add('claude-md', claude?.includes('@AGENTS.md') ? 'ok' : 'fail', claude ? 'CLAUDE.md importa AGENTS.md' : 'CLAUDE.md ausente');

    let settings: any;
    try { settings = readJson(path.join(dir, '.claude', 'settings.json')); } catch (e) { add('claude-hooks', 'fail', (e as Error).message); }
    if (settings !== undefined) {
      const missing = Object.entries(HOOKS).filter(([event, cmd]) =>
        !(settings?.hooks?.[event] || []).some((g: any) => (g.hooks || []).some((h: any) => String(h.command || '').includes(`forja ${cmd}`))));
      add('claude-hooks', missing.length ? 'fail' : 'ok', missing.length ? `hooks ausentes: ${missing.map(([e]) => e).join(', ')}` : 'SessionStart + UserPromptSubmit');
    }

    const absent = ROLES.filter((r) => !fs.existsSync(path.join(dir, '.claude', 'agents', `${r}.md`)));
    add('claude-agents', absent.length ? 'fail' : 'ok', absent.length ? `sub-agents ausentes: ${absent.join(', ')}` : `${ROLES.length} sub-agents`);
  }
  if (wiredAi.includes('gemini')) {
    add('gemini-md', readOrNull(path.join(dir, 'GEMINI.md'))?.includes('@AGENTS.md') ? 'ok' : 'fail', 'GEMINI.md importa AGENTS.md');
  }
  if (wiredAi.includes('copilot')) {
    add('copilot-md', readOrNull(path.join(dir, '.github', 'copilot-instructions.md'))?.includes(BEGIN) ? 'ok' : 'fail', '.github/copilot-instructions.md com o bloco do Forja');
  }

  let models: any;
  try { models = readJson(path.join(dir, '.forja', 'models.json')); } catch { models = null; }
  const chain = Array.isArray(models?.fallback_chain) ? models.fallback_chain : null;
  if (!chain) add('models', 'fail', '.forja/models.json ausente ou inválido');
  else if (JSON.stringify([...chain].sort()) !== JSON.stringify([...wiredAi].sort())) add('models', 'fail', `fallback_chain ${JSON.stringify(chain)} ≠ IAs conectadas ${JSON.stringify(wiredAi)}`);
  else add('models', 'ok', `fallback: ${chain.join(' → ')}`);

  let mcp: any;
  try { mcp = readJson(path.join(dir, '.mcp.json')); } catch (e) { add('mcp', 'fail', (e as Error).message); }
  if (mcp !== undefined) {
    if (mcp?.mcpServers?.forja?.command !== 'forja') add('mcp', 'fail', '.mcp.json sem o servidor forja');
    else if (mcp.mcpServers.codegraph && !hasBinary('codegraph')) add('mcp', 'warn', 'codegraph registrado no .mcp.json mas ausente do PATH');
    else add('mcp', 'ok', `servidores: ${Object.keys(mcp.mcpServers).join(', ')}`);
  }

  // MCP nas outras IAs conectadas.
  const mcpGaps: string[] = [];
  if (wiredAi.includes('codex') && !/^\[mcp_servers\.forja\]/m.test(readOrNull(path.join(dir, '.codex', 'config.toml')) ?? '')) mcpGaps.push('.codex/config.toml');
  const jsonHas = (rel: string, pick: (j: any) => any) => { try { return Boolean(pick(readJson(path.join(dir, rel)))); } catch { return false; } };
  if (wiredAi.includes('gemini') && !jsonHas(path.join('.gemini', 'settings.json'), (j) => j?.mcpServers?.forja)) mcpGaps.push('.gemini/settings.json');
  if (wiredAi.includes('copilot') && !jsonHas(path.join('.vscode', 'mcp.json'), (j) => j?.servers?.forja)) mcpGaps.push('.vscode/mcp.json');
  const others = wiredAi.filter((a) => a !== 'claude');
  if (others.length) add('mcp-ias', mcpGaps.length ? 'fail' : 'ok', mcpGaps.length ? `servidor forja ausente em: ${mcpGaps.join(', ')}` : `servidor forja também em: ${others.join(', ')}`);

  // Todo comando citado ao usuário/IA precisa existir — é o que impede instrução que não funciona.
  const cited = new Map<string, string>();
  const texts = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', path.join('.github', 'copilot-instructions.md'),
    ...ROLES.map((r) => path.join('.claude', 'agents', `${r}.md`))];
  for (const rel of texts) {
    const t = readOrNull(path.join(dir, rel));
    if (t) for (const c of citedForjaCommands(t)) if (!cited.has(c)) cited.set(c, rel);
  }
  try {
    const s = readJson(path.join(dir, '.claude', 'settings.json'));
    for (const c of citedForjaCommands(JSON.stringify(s ?? {}))) if (!cited.has(c)) cited.set(c, '.claude/settings.json');
  } catch { /* já reportado acima */ }
  const unknown = [...cited].filter(([c]) => !(c in commands)).map(([c, f]) => `${c} (${f})`);
  add('commands', unknown.length ? 'fail' : 'ok', unknown.length ? `comandos inexistentes citados: ${unknown.join(', ')}` : `${cited.size} comandos citados, todos no registry`);

  const broken = ['.', 'backend'].flatMap((sub) => fs.existsSync(path.join(dir, sub, 'package.json'))
    ? brokenNodeScripts(path.join(dir, sub)).map((b) => (sub === '.' ? b : `${sub}/${b}`)) : []);
  add('scripts', broken.length ? 'fail' : 'ok', broken.length ? `scripts apontam para arquivo ausente: ${broken.join('; ')}` : 'todo `node <arquivo>` dos package.json existe');

  const gi = new Set((readOrNull(path.join(dir, '.gitignore')) ?? '').split('\n').map((l) => l.trim()));
  const unignored = GITIGNORE.filter((l) => !gi.has(l));
  add('gitignore', unignored.length ? 'warn' : 'ok', unignored.length ? `fora do .gitignore (o índice iria para o git): ${unignored.join(', ')}` : 'índice e .context/ fora do git');

  add('forja-bin', hasBinary('forja') ? 'ok' : 'warn', hasBinary('forja') ? 'forja no PATH' : 'forja fora do PATH — hooks e MCP ficam inativos (npm i -g forjajs)');
  return checks;
}
