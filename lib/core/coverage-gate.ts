/**
 * lib/core/coverage-gate.ts — a régua de cobertura da SPEC-056 AC-3, sem rodar a suíte.
 *
 * `scripts/coverage-gate.ts` precisa spawnar `node --test --experimental-test-coverage` inteiro para
 * chegar num veredito, o que o torna impossível de testar: um teste dele rodaria a suíte dentro da
 * suíte. Aqui fica só o que dá para provar sozinho — ler a linha `all files` da tabela do Node, ler o
 * piso versionado e decidir o código de saída. O script vira um adaptador fino: coleta as quatro
 * entradas, chama `decideCoverage()` e emite no contrato do ADR-0082.
 *
 * A ordem das decisões é o contrato, não um detalhe: suíte que falha é mais grave que piso baixo (não
 * adianta cobrar cobertura de uma suíte vermelha), e tabela ausente é falha operacional do gate — o
 * formato do Node mudou —, nunca um "OK" silencioso.
 */

/** `all files | line % | branch % | funcs %` — a régua cobrada é a de linhas. */
const TOTAL_RE = /all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/;

export type CoverageTotal = {
  readonly lines: number;
  readonly branches: number;
  readonly funcs: number;
};

export type CoverageInput = {
  /** Mensagem do erro de spawn, ou `null` quando a suíte chegou a rodar. */
  readonly spawnError: string | null;
  /** Tabela já lida, ou `null` quando a linha `all files` não apareceu na saída. */
  readonly total: CoverageTotal | null;
  /** Código de saída da suíte; `null` quando o processo morreu por sinal. */
  readonly suiteStatus: number | null;
  readonly floor: number;
};

export type CoverageOutcome =
  | { readonly kind: 'spawn-failed'; readonly exitCode: 1; readonly code: 'ESPAWN' }
  | { readonly kind: 'table-missing'; readonly exitCode: 1; readonly code: 'EPARSE' }
  | { readonly kind: 'suite-failed'; readonly exitCode: number; readonly code: 'ESUITE' }
  | { readonly kind: 'below-floor'; readonly exitCode: 2; readonly code: 'EFLOOR' }
  | { readonly kind: 'ok'; readonly exitCode: 0; readonly code: 'OK' };

/** Devolve os três percentuais da linha `all files`, ou `null` se a tabela não está lá. */
export function parseCoverageTotal(stdout: string): CoverageTotal | null {
  const total = TOTAL_RE.exec(stdout);
  if (total === null) return null;
  const [lines, branches, funcs] = [total[1], total[2], total[3]].map(Number);
  return { lines, branches, funcs };
}

/**
 * Lê `coverageLineFloor` do texto do orçamento. Recebe o texto, não o caminho: quem lê o arquivo é o
 * script, que é quem sabe transformar ENOENT em receita de criação do arquivo.
 */
export function coverageFloorFrom(budgetText: string, label: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(budgetText);
  } catch (err) {
    throw new Error(`orçamento ilegível (${label}): ${err instanceof Error ? err.message : String(err)}`);
  }
  const value = (parsed as { coverageLineFloor?: unknown } | null)?.coverageLineFloor;
  if (typeof value !== 'number') throw new Error(`${label} sem coverageLineFloor numérico`);
  return value;
}

/** A tabela de decisão do gate — cada ramo tem um código de saída próprio e nenhum deles é 0 por omissão. */
export function decideCoverage(input: CoverageInput): CoverageOutcome {
  if (input.spawnError !== null) return { kind: 'spawn-failed', exitCode: 1, code: 'ESPAWN' };
  if (input.total === null) return { kind: 'table-missing', exitCode: 1, code: 'EPARSE' };
  // `null` = morto por sinal: não há código para repassar, e o gate não pode sair 0 por isso.
  const status = input.suiteStatus ?? 1;
  if (status !== 0) return { kind: 'suite-failed', exitCode: status, code: 'ESUITE' };
  if (input.total.lines < input.floor) return { kind: 'below-floor', exitCode: 2, code: 'EFLOOR' };
  return { kind: 'ok', exitCode: 0, code: 'OK' };
}

/** Linha humana única, igual nos três desfechos — o CI lê o mesmo formato seja verde ou vermelho. */
export function coverageSummary(total: CoverageTotal, floor: number): string {
  return `cobertura de linhas ${total.lines.toFixed(2)}% (piso ${floor}%) · branches ${total.branches.toFixed(2)}% · funções ${total.funcs.toFixed(2)}%`;
}
