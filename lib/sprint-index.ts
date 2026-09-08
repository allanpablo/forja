/**
 * lib/sprint-index.ts — leitura da sprint ativa (SPEC-044).
 *
 * `scripts/sprint-manager.ts` só imprime o arquivo; aqui devolvemos dado. Fonte é a mesma:
 * `memory/40-delivery/current-sprint.md` no root dado.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface SprintInfo {
  readonly active: boolean;
  readonly title: string | null;
  /** Itens de checklist (`- [ ]` / `- [x]`) encontrados. */
  readonly items: number;
  readonly done: number;
}

/** `null` quando não há sprint ativa. Nunca lança. */
export function readSprint(root: string): SprintInfo | null {
  const sprintFile = path.join(root, 'memory', '40-delivery', 'current-sprint.md');
  let content: string;
  try {
    if (!fs.existsSync(sprintFile)) return null;
    content = fs.readFileSync(sprintFile, 'utf8');
  } catch {
    return null;
  }
  const lines = content.split('\n');
  const heading = lines.find((l) => /^#{1,3}\s+\S/.test(l));
  const title = heading ? heading.replace(/^#{1,3}\s+/, '').trim() : null;
  let items = 0;
  let done = 0;
  for (const l of lines) {
    if (/^[-*]\s+\[[ xX]\]\s+/.test(l)) {
      items += 1;
      if (/^[-*]\s+\[[xX]\]\s+/.test(l)) done += 1;
    }
  }
  return { active: true, title, items, done };
}
