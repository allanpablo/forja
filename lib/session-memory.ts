/**
 * lib/session-memory.ts — checkpoint determinístico de uma sessão do Claude Code (SPEC-052, ADR-0091).
 *
 * Lê o transcript JSONL que o Claude Code passa aos hooks e extrai só fatos estruturais: título da
 * sessão, branch, arquivos editados, comandos `forja`, specs tocadas e assuntos de commit. Nunca o
 * texto de prompts, comandos inteiros ou saídas de ferramenta: o checkpoint vai para `memory/`, que é
 * commitada, e um segredo colado no chat não pode acabar no git.
 *
 * O formato do transcript não é contrato público: o que não for reconhecido é ignorado.
 */

import fs from 'node:fs';
import path from 'node:path';
import { COMMANDS } from './core/registry.ts';

export interface SessionDigest {
  readonly sessionId: string;
  readonly title: string | null;
  readonly branch: string | null;
  readonly startedAt: string | null;
  readonly updatedAt: string | null;
  readonly files: readonly string[];
  readonly forjaCommands: readonly string[];
  readonly specs: readonly string[];
  readonly commits: readonly string[];
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SESSIONS_DIR = path.join('memory', '60-runs', 'sessions');

/** `forja spec:new x`, `npx forja status`, `node bin/forja.ts spec:check` → nome do subcomando. */
const FORJA_CMD = /(?:^|[\s;&|(])(?:npx\s+)?(?:forja|node\s+\S*bin\/forja\.[jt]s)\s+([a-z][\w-]*(?::[\w-]+)*)/g;
/** `forja spec:plan <slug>` e afins: o slug é a spec tocada (não é texto livre do usuário). */
const FORJA_SPEC = /forja(?:\.[jt]s)?\s+spec:[a-z]+\s+([a-z0-9][a-z0-9-]*)/g;
// O heredoc vem primeiro: `-m "$(cat <<'EOF'` também casaria a alternativa de aspas.
/** `specs/<slug>/` citado num comando (caminho, não texto livre); filtrado depois pelas specs que existem. */
const SPEC_PATH = /(?:^|[\s'"=(])(?:\.\/)?specs\/([a-z0-9][a-z0-9-]*)\//g;
const COMMIT_MSG = /git\s+commit\b[^\n]*?\s-[a-zA-Z]*m\s+(?:"?\$\(cat\s+<<-?\s*'?EOF'?\n([^\n]+)|"([^"\n]+)|'([^'\n]+))/;

function relativeTo(root: string, file: string): string | null {
  const abs = path.resolve(root, file);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

function specOf(rel: string): string | null {
  const m = rel.match(/^specs\/([^/_.][^/]*)\//);
  return m ? m[1] : null;
}

/**
 * Lê o transcript e devolve o resumo. `root` é a raiz do projeto: arquivos fora dela não entram.
 * Linhas sem `tool_use` nem `ai-title` são descartadas antes do `JSON.parse` (transcripts têm MBs).
 */
export function digestTranscript(transcriptPath: string, root: string, sessionId: string): SessionDigest {
  const raw = fs.readFileSync(transcriptPath, 'utf8');
  let title: string | null = null;
  let branch: string | null = null;
  let startedAt: string | null = null;
  let updatedAt: string | null = null;
  const files = new Set<string>();
  const commands = new Set<string>();
  const specs = new Set<string>();
  const commits: string[] = [];

  // Uma ferramenta só conta quando o resultado volta sem erro: edição negada ou commit que falhou
  // não é trabalho feito. Guardamos o efeito pelo id do tool_use e aplicamos no tool_result.
  const pending = new Map<string, () => void>();

  for (const line of raw.split('\n')) {
    if (!line) continue;
    const relevant = line.includes('"tool_use"') || line.includes('"tool_result"') || line.includes('"ai-title"')
      || (!startedAt && line.includes('"timestamp"'));
    if (!relevant) continue;
    let e: any;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'ai-title' && typeof e.aiTitle === 'string') { title = e.aiTitle; continue; }
    if (typeof e.timestamp === 'string') {
      startedAt ??= e.timestamp;
      updatedAt = e.timestamp;
    }
    if (typeof e.gitBranch === 'string' && e.gitBranch) branch = e.gitBranch;
    const content = Array.isArray(e.message?.content) ? e.message.content : [];
    for (const c of content) {
      if (c?.type === 'tool_result') {
        const apply = pending.get(c.tool_use_id);
        if (apply && c.is_error !== true) apply();
        pending.delete(c.tool_use_id);
        continue;
      }
      if (c?.type !== 'tool_use' || !c.input || typeof c.id !== 'string') continue;
      if (EDIT_TOOLS.has(c.name)) {
        const target = c.input.file_path ?? c.input.notebook_path;
        const rel = typeof target === 'string' ? relativeTo(root, target) : null;
        if (rel) pending.set(c.id, () => {
          files.add(rel);
          const s = specOf(rel);
          if (s) specs.add(s);
        });
      } else if (c.name === 'Bash' && typeof c.input.command === 'string') {
        const cmd: string = c.input.command;
        pending.set(c.id, () => {
          // Só nomes do registry: texto de heredoc ("forja e ...") não vira comando.
          for (const m of cmd.matchAll(FORJA_CMD)) if (m[1] in COMMANDS) commands.add(m[1]);
          for (const m of cmd.matchAll(FORJA_SPEC)) specs.add(m[1]);
          for (const m of cmd.matchAll(SPEC_PATH)) specs.add(m[1]);
          const cm = cmd.match(COMMIT_MSG);
          const subject = cm && (cm[1] ?? cm[2] ?? cm[3])?.trim();
          if (subject && !commits.includes(subject)) commits.push(subject.slice(0, 120));
        });
      }
    }
  }

  // Só specs que existem no projeto: um slug citado à toa não vira memória.
  const realSpecs = [...specs].filter((s) => fs.existsSync(path.join(root, 'specs', s, 'spec.md'))).sort();
  return { sessionId, title, branch, startedAt, updatedAt, files: [...files].sort(), forjaCommands: [...commands].sort(), specs: realSpecs, commits };
}

/** Sessão sem edição, sem comando forja e sem commit não é memória: é conversa. */
export function hasWork(d: SessionDigest): boolean {
  return d.files.length > 0 || d.forjaCommands.length > 0 || d.commits.length > 0;
}

export function checkpointPath(root: string, d: Pick<SessionDigest, 'sessionId' | 'startedAt'>): string {
  const day = (d.startedAt ?? new Date().toISOString()).slice(0, 10);
  const id = d.sessionId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8) || 'sessao';
  return path.join(root, SESSIONS_DIR, `${day}-${id}.md`);
}

const MAX_FILES = 60;

export function renderCheckpoint(d: SessionDigest, event: string): string {
  const lines = [`# Sessão ${d.sessionId.slice(0, 8)}${d.title ? ` — ${d.title}` : ''}`, ''];
  lines.push(`- **Sessão**: ${d.sessionId}`);
  if (d.branch) lines.push(`- **Branch**: ${d.branch}`);
  if (d.startedAt) lines.push(`- **Início**: ${d.startedAt}`);
  if (d.updatedAt) lines.push(`- **Atualizado**: ${d.updatedAt} (${event})`);
  lines.push(`- **Specs**: ${d.specs.length ? d.specs.join(', ') : '—'}`);
  lines.push('');
  if (d.commits.length) {
    lines.push('## Commits', '', ...d.commits.map((c) => `- ${c}`), '');
  }
  if (d.files.length) {
    lines.push(`## Arquivos editados (${d.files.length})`, '');
    lines.push(...d.files.slice(0, MAX_FILES).map((f) => `- \`${f}\``));
    if (d.files.length > MAX_FILES) lines.push(`- … e mais ${d.files.length - MAX_FILES}`);
    lines.push('');
  }
  if (d.forjaCommands.length) {
    lines.push('## Comandos forja', '', d.forjaCommands.map((c) => `\`${c}\``).join(' · '), '');
  }
  lines.push('<!-- forja:session-memory — gerado pelos hooks Stop/PreCompact (ADR-0091). Sem texto de prompt. -->');
  return `${lines.join('\n')}\n`;
}

/** Grava (ou reescreve) o checkpoint. Devolve o caminho, ou null quando não há trabalho a registrar. */
export function writeCheckpoint(root: string, transcriptPath: string, sessionId: string, event: string): string | null {
  if (!fs.existsSync(path.join(root, 'memory'))) return null;
  const d = digestTranscript(transcriptPath, root, sessionId);
  if (!hasWork(d)) return null;
  const file = checkpointPath(root, d);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderCheckpoint(d, event), 'utf8');
  return file;
}

/** Checkpoint desta sessão (para o SessionStart `compact`), ou null. */
export function findCheckpoint(root: string, sessionId: string): string | null {
  const dir = path.join(root, SESSIONS_DIR);
  const id = sessionId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8);
  if (!id) return null;
  try {
    const hit = fs.readdirSync(dir).filter((n) => n.endsWith(`-${id}.md`)).sort().pop();
    return hit ? path.join(dir, hit) : null;
  } catch { return null; }
}

/** Checkpoint mais recente (por mtime), exceto o da sessão atual. */
export function latestCheckpoint(root: string, exceptSessionId?: string): string | null {
  const dir = path.join(root, SESSIONS_DIR);
  const skip = exceptSessionId ? `-${exceptSessionId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8)}.md` : null;
  try {
    const files = fs.readdirSync(dir).filter((n) => n.endsWith('.md') && (!skip || !n.endsWith(skip)))
      .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return files.length ? path.join(dir, files[0].n) : null;
  } catch { return null; }
}

/** Uma linha sobre um checkpoint: data, título, nº de arquivos, specs. */
export function summarizeCheckpoint(file: string): string {
  const text = fs.readFileSync(file, 'utf8');
  const title = text.match(/^# Sessão \S+(?: — (.+))?$/m)?.[1] ?? 'sem título';
  const updated = text.match(/^- \*\*Atualizado\*\*: (\S+)/m)?.[1]?.slice(0, 16).replace('T', ' ') ?? '?';
  const nFiles = text.match(/^## Arquivos editados \((\d+)\)/m)?.[1] ?? '0';
  const specs = text.match(/^- \*\*Specs\*\*: (.+)$/m)?.[1] ?? '—';
  return `${updated} — ${title} · ${nFiles} arquivo(s) · specs: ${specs}`;
}
