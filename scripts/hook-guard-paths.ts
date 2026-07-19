#!/usr/bin/env node
/**
 * Hook PreToolUse — guarda de caminhos protegidos (ADR-0021).
 *
 * O CLAUDE.md declara `projects/` off-limits e `docs/archive/` como material
 * histórico congelado. Até aqui isso era prosa: valia enquanto a IA lembrasse.
 * Este hook torna a regra determinística — a escrita é barrada antes de acontecer,
 * não corrigida depois.
 *
 * Protocolo:
 * - stdin: JSON com { tool_name, tool_input: { file_path }, cwd }
 * - exit 0: liberado (silencioso)
 * - exit 2: bloqueado — stderr volta para a IA como feedback acionável
 *
 * Escape hatch: FORJA_GUARD=0 desliga (útil para manutenção deliberada do archive).
 */

import path from 'node:path';
import process from 'node:process';

/** Cada regra explica o porquê: a IA recebe o motivo, não só a negativa. */
const PROTECTED = [
  {
    test: (rel: any) => rel === 'projects' || rel.startsWith('projects/'),
    reason:
      'projects/ é off-limits (CLAUDE.md): contém produtos em desenvolvimento ativo do usuário. ' +
      'Aplicações reais vivem no workspace externo — use `npm run project:new` (ADR-0019).',
  },
  {
    test: (rel: any) => rel.startsWith('docs/archive/'),
    reason:
      'docs/archive/ é material histórico congelado (ex.: legacy-bin/, mantido só para referência). ' +
      'Se a mudança é real, ela pertence ao código vivo em bin/ ou lib/.',
  },
];

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
  });
}

/** Falha aberta: um guard quebrado não pode travar a sessão inteira. */
/** @returns {never} */
function allow(): never { process.exit(0); }

(async function main() {
  if (process.env.FORJA_GUARD === '0') allow();

  let payload;
  try {
    payload = JSON.parse((await readStdin()) as string);
  } catch {
    allow();
  }

  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== 'string' || !filePath) allow();

  const root = process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();
  const abs = path.resolve(root, filePath);
  const rel = path.relative(root, abs);

  // Fora do repo: não é competência deste guard.
  if (rel.startsWith('..') || path.isAbsolute(rel)) allow();

  const relPosix = rel.split(path.sep).join('/');
  const hit = PROTECTED.find((rule) => rule.test(relPosix));
  if (!hit) allow();

  process.stderr.write(`Escrita bloqueada em \`${relPosix}\`.\n\n${hit.reason}\n`);
  process.exit(2);
})();
