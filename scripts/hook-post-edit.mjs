#!/usr/bin/env node
/**
 * Hook PostToolUse — fecha o loop do registry (ADR-0021).
 *
 * ADR-0020 estabelece a invariante: "comando novo = entrada nova no registry".
 * `test/forja-core.test.js` valida isso, mas só rodava no pre-commit — e o
 * lefthook é opt-in, então na prática podia nunca rodar. Resultado: a quebra
 * aparecia minutos ou commits depois, longe da edição que a causou.
 *
 * Aqui o teste roda no instante em que o registry (ou o package.json que o
 * espelha) é tocado. Custo: um único arquivo de teste, poucos segundos.
 *
 * Protocolo:
 * - stdin: JSON com { tool_name, tool_input: { file_path }, cwd }
 * - exit 0: nada a fazer, ou teste passou (silencioso)
 * - exit 2: teste falhou — stderr volta para a IA, que corrige antes de seguir
 *
 * Escape hatch: FORJA_HOOK_TEST=0 desliga.
 */

import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

/** Arquivos cuja edição invalida a integridade do core. */
const WATCHED = ['lib/core/registry.mjs', 'package.json'];
const SUITE = 'test/forja-core.test.js';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
  });
}

function skip() { process.exit(0); }

(async function main() {
  if (process.env.FORJA_HOOK_TEST === '0') skip();

  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    skip();
  }

  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== 'string' || !filePath) skip();

  const root = process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();
  const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/');
  if (!WATCHED.includes(rel)) skip();

  const res = spawnSync(process.execPath, ['--test', SUITE], {
    cwd: root,
    encoding: 'utf8',
    // Evita recursão: o teste roda `bin/forja.mjs`, que não deve reentrar no hook.
    env: { ...process.env, FORJA_HOOK_TEST: '0' },
  });

  if (res.status === 0) skip();

  const detail = (res.stdout || '') + (res.stderr || '');
  const failures = detail
    .split('\n')
    .filter((l) => /^not ok |^\s+error:|AssertionError/.test(l))
    .slice(0, 12)
    .join('\n');

  process.stderr.write(
    `\`${rel}\` foi editado e \`${SUITE}\` quebrou — a integridade do registry (ADR-0020) está violada.\n\n` +
    `${failures || detail.slice(-1500)}\n\n` +
    `Um comando novo precisa de: entrada em lib/core/registry.mjs + alias em package.json + script existente.\n`
  );
  process.exit(2);
})();
