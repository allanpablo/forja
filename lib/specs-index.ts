/**
 * lib/specs-index.ts — leitura do índice de specs SDD (SPEC-044).
 *
 * Extraído de `scripts/hook-session-start.ts` para ser compartilhado entre o hook e
 * `forja status`/`forja next`. Sem dependência de SQLite: é só `specs/<slug>/{spec,plan,tasks}.md`.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface SpecEntry {
  readonly slug: string;
  /** Status declarado em `spec.md`. */
  readonly status: string;
  /** Status de `plan.md`, ou `null` se o arquivo não existe. */
  readonly plan: string | null;
  /** Status de `tasks.md`, ou `null` se o arquivo não existe. */
  readonly tasks: string | null;
}

const STATUS_LINE_RE = /(?:^|\n)[-*]?\s*\*+Status\*+:\s*([^\n\r]+)/i;
const STATUS_ALT_RE = /(?:^|\n)Status:\s*([^\n\r]+)/i;

export function normalizeStatus(raw: string): string {
  const trimmed = raw.replace(/[`*]/g, '').trim().toLowerCase();
  if (/^(done|conclu[íi]do|concluida|concluido|completed|finalizado)/i.test(trimmed)) return 'done';
  if (/^(implementing|em implementa[çc][ãa]o|implementando)/i.test(trimmed)) return 'implementing';
  if (/^(approved|aprovado|aprovada)/i.test(trimmed)) return 'approved';
  if (/^(review|em revis[ãa]o|revis[ãa]o|revisao)/i.test(trimmed)) return 'review';
  if (/^(draft|rascunho)/i.test(trimmed)) return 'draft';
  if (/^(abandoned|abandonado|cancelado)/i.test(trimmed)) return 'abandoned';
  const firstWord = trimmed.split(/[\s|—–-]+/)[0];
  return firstWord || 'unknown';
}

function safeReadDir(p: string): string[] {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function statusOf(file: string): string | null {
  try {
    if (!fs.existsSync(file)) return null;
    const content = fs.readFileSync(file, 'utf8');
    const m = content.match(STATUS_LINE_RE) || content.match(STATUS_ALT_RE);
    return m ? normalizeStatus(m[1]) : 'unknown';
  } catch {
    return null;
  }
}

/**
 * Lista as specs versionadas do repo com o status de cada artefato SDD. `root` é a raiz do repo
 * (onde vive `specs/`). Nunca lança.
 */
export function listSpecs(root: string): SpecEntry[] {
  const specsDir = path.join(root, 'specs');
  const out: SpecEntry[] = [];
  for (const slug of safeReadDir(specsDir)) {
    if (slug.startsWith('_') || slug.startsWith('.')) continue;
    const dir = path.join(specsDir, slug);
    const specStatus = statusOf(path.join(dir, 'spec.md'));
    if (specStatus === null) continue;
    out.push({
      slug,
      status: specStatus,
      plan: statusOf(path.join(dir, 'plan.md')),
      tasks: statusOf(path.join(dir, 'tasks.md')),
    });
  }
  return out;
}
