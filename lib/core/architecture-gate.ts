/**
 * lib/core/architecture-gate.ts — ponte opt-in entre `architecture:check` (SPEC-033) e `check:all`
 * (AC-7).
 *
 * Mesmo padrão de `lib/core/drift-gate.ts`: chama o comando real via subprocess em vez de
 * reimportar os internals, e traduz o resultado num `Result` do runner de gates. `architecture:check`
 * reindexa o workspace inteiro (mesmo custo de `drift:check`/`graph:sync`) — por isso opt-in
 * (`--with-architecture`), não o comportamento padrão de `check:all`.
 *
 * `severity: 'critical'` on a violation (not `'warn'` like the drift-gate — the gate runner's own
 * `Severity` type is only `'critical' | 'warn'`, a coarser vocabulary than `ArchitectureSeverity`):
 * a violation only exists because a rule reached `active` — either the deterministic parser had
 * confidence 1, or a human explicitly ran `architecture:approve`. Unlike drift (which signals
 * something for review, no prior judgment of right/wrong), an `active` rule is by definition a
 * decision someone already confirmed should be respected — violating it is a real failure, not an
 * invitation to review, so (unlike drift) it's allowed to escalate `check:all`'s verdict to `fail`.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveScript } from './registry.ts';
import type { Result } from './checks.ts';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const ID = 'architecture-check';
const TITLE = 'architecture:check — o código respeita a Constitution compilada (SPEC-033, opt-in)';

/** Cada violação imprime sua própria linha de severidade (ver cmdCheck em scripts/architecture.ts)
 *  — contar essas linhas é mais direto que reanalisar o relatório inteiro aqui. */
function violationCountFrom(stdout: string): number {
  return stdout.split('\n').filter((line) => /^(INFO|LOW|MEDIUM|HIGH|CRITICAL)$/.test(line.trim())).length;
}

/** Roda `architecture:check` num subprocesso e traduz o resultado num `Result` de gate. */
export async function runArchitectureGate(): Promise<Result[]> {
  const script = resolveScript(repoRoot, 'scripts/architecture.ts');
  const result = spawnSync('node', [script, 'check'], { cwd: process.cwd(), encoding: 'utf8' });
  const stdout = result.stdout ?? '';

  if (result.error !== undefined || (result.status !== 0 && result.status !== 1)) {
    return [{
      id: ID,
      title: TITLE,
      severity: 'critical',
      status: 'fail',
      detail: `architecture:check não rodou: ${result.stderr || result.error?.message || `exit ${result.status}`}`,
      fix: 'rode `forja architecture:check` diretamente para depurar; se nunca compilado, rode `forja architecture:compile` primeiro',
    }];
  }

  if (stdout.includes('Nenhuma regra compilada')) {
    return [{ id: ID, title: TITLE, severity: 'critical', status: 'warn', detail: 'nenhuma Constitution compilada ainda — rode `forja architecture:compile`', fix: '`forja architecture:compile`' }];
  }

  if (result.status === 1) {
    return [{
      id: ID,
      title: TITLE,
      severity: 'critical',
      status: 'fail',
      detail: `${violationCountFrom(stdout)} violação(ões) de arquitetura encontrada(s)`,
      fix: '`forja architecture:check` para o relatório completo, com remediação sugerida por violação',
    }];
  }

  return [{ id: ID, title: TITLE, severity: 'critical', status: 'ok', detail: 'código em conformidade com toda regra active da Constitution', fix: null }];
}
