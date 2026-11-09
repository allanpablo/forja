// Fixture para test/cli-output.test.js — chama uma das saídas do contrato (SPEC-045).
import { emitOk, emitError, emitRejected } from '../../lib/cli-output.ts';

const which = process.argv[2];
if (which === 'ok') emitOk({ foo: 1 });
else if (which === 'error') emitError('deu ruim', { code: 'BOOM', detail: 'rastro no stderr' });
else if (which === 'rejected') emitRejected({ recommendation: 'discard' });
// 6× o buffer do pipe (64KB): prova que a saída não é truncada pelo process.exit() seguinte.
else if (which === 'big') emitOk({ big: 'x'.repeat(400_000) });
else {
  process.stderr.write('uso: emit-probe <ok|error|rejected|big>\n');
  process.exit(3);
}
