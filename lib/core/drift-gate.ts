/**
 * lib/core/drift-gate.ts — ponte opt-in entre `drift:check` (SPEC-030) e `check:all` (AC-5).
 *
 * `drift:check` reindexa o workspace inteiro por extração determinística — o mesmo custo de rodar
 * `graph:sync`/`code:index` uma vez a mais (ver NFR do spec). Rodar isso em **todo** `check:all`
 * (e, por extensão, em todo commit/CI) seria caro demais para repos grandes sem medição prévia de
 * custo — por isso AC-5 pede opt-in (`--with-drift`), nunca o comportamento padrão.
 *
 * Este módulo não reimplementa `drift:check`: chama o comando real via subprocess (mesmo padrão de
 * `lib/core/release.ts`/`project-smoke.ts`, que também compõem gates via `execFileSync` em vez de
 * importar os internals uns dos outros) e traduz a saída num `Result` do runner de gates
 * (`lib/core/checks.ts`). `severity: 'warn'` é deliberado: drift é sinal para revisão humana/de
 * agente, não uma falha que deve travar `check:all` (SPEC-030 §5 — o comando só sinaliza, nunca
 * corrige ou bloqueia sozinho).
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveScript } from './registry.ts';
import type { Result } from './checks.ts';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const ID = 'drift-check';
const TITLE = 'drift:check — o verified continua verdade (SPEC-030, opt-in)';

function driftCountFrom(stdout: string): string {
  return /(\d+) com drift detectado/.exec(stdout)?.[1] ?? '?';
}

/** Roda `drift:check` num subprocesso e traduz o resultado num `Result` de gate. */
export async function runDriftGate(): Promise<Result[]> {
  const script = resolveScript(repoRoot, 'scripts/drift-check.ts');
  const result = spawnSync('node', [script], { cwd: process.cwd(), encoding: 'utf8' });
  const stdout = result.stdout ?? '';

  // exit 0 = sem drift, exit 1 = drift detectado (ambos "o comando rodou"); qualquer outro código —
  // ou erro ao spawnar — é falha de infraestrutura do gate em si, não um veredito sobre o grafo.
  if (result.error !== undefined || (result.status !== 0 && result.status !== 1)) {
    return [{
      id: ID,
      title: TITLE,
      severity: 'warn',
      status: 'fail',
      detail: `drift:check não rodou: ${result.stderr || result.error?.message || `exit ${result.status}`}`,
      fix: 'rode `forja drift:check` diretamente para depurar',
    }];
  }

  if (result.status === 1) {
    return [{
      id: ID,
      title: TITLE,
      severity: 'warn',
      status: 'warn',
      detail: `${driftCountFrom(stdout)} documento(s) com relação(ões) verified que a extração atual não reproduz mais`,
      fix: '`forja drift:check` para o relatório completo — corrigir o código ou a ADR/spec desatualizada é decisão humana/de agente',
    }];
  }

  return [{ id: ID, title: TITLE, severity: 'warn', status: 'ok', detail: 'nenhuma relação verified ficou stale desde a última indexação', fix: null }];
}
