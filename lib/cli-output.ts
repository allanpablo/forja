/**
 * lib/cli-output.ts — o contrato de saída `--json` da CLI (SPEC-045, ADR-0082).
 *
 * Três saídas, cada uma termina o processo com o exit code certo:
 *
 *   emitOk(fields?)        → stdout {status:'ok', ...fields}          · exit 0
 *   emitError(msg, opts?)  → stdout {status:'error', error:{...}}     · exit 1  (opts.detail → stderr)
 *   emitRejected(fields?)  → stdout {status:'rejected', ...fields}    · exit 2
 *
 * O stdout carrega **um único** objeto JSON, sempre. Diagnóstico verboso vai para o stderr.
 * Use só no ramo `--json`; a saída de texto de cada comando continua como está.
 */

import fs from 'node:fs';

type JsonFields = Record<string, unknown>;

/**
 * Escreve até o último byte antes de devolver. `process.stdout.write` + `process.exit()` trunca no
 * tamanho do buffer do pipe (64KB): o JSON de `spec:trace --json` saía cortado e quem fazia parse
 * recebia "Unterminated string in JSON" — sem erro do comando, exit 0. `fs.writeSync` bloqueia, e o
 * laço cobre o caso de escrita parcial.
 */
function writeAll(fd: number, text: string): void {
  const buf = Buffer.from(text, 'utf8');
  for (let offset = 0; offset < buf.length; ) offset += fs.writeSync(fd, buf, offset, buf.length - offset);
}

function write(payload: JsonFields, code: number): never {
  writeAll(1, JSON.stringify(payload) + '\n');
  process.exit(code);
}

/** Sucesso. `fields` são os dados do comando, no topo, ao lado de `status`. */
export function emitOk(fields: JsonFields = {}): never {
  return write({ status: 'ok', ...fields }, 0);
}

/**
 * Falha operacional: args inválidos, arquivo ausente, subsistema fora. `opts.detail` (rastro
 * verboso, nunca stack trace cru) vai para o stderr; nunca para o stdout.
 */
export function emitError(message: string, opts: { code?: string; detail?: string } = {}): never {
  if (opts.detail) writeAll(2, opts.detail.replace(/\s+$/, '') + '\n');
  const error: JsonFields = { message };
  if (opts.code) error.code = opts.code;
  return write({ status: 'error', error }, 1);
}

/**
 * Uma validação ou gate que o **próprio comando** roda deu negativo (ex.: `simulate` discard,
 * checks de `llm:run`). O payload da avaliação segue no objeto.
 */
export function emitRejected(fields: JsonFields = {}): never {
  return write({ status: 'rejected', ...fields }, 2);
}
