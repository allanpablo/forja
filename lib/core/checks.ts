/**
 * lib/core/checks.mjs — o runner de checks. Sem opinião sobre o que se checa.
 *
 * Máquina compartilhada por dois catálogos, cada um guardando uma fronteira:
 *
 *   health.mjs   o núcleo — o que impede o framework de trabalhar aqui (SPEC-009, ADR-0023)
 *   release.mjs  o tarball — o que impede o pacote de funcionar na máquina de quem instala (SPEC-010)
 *
 * O runner foi extraído, e não copiado, de propósito: duas máquinas iguais divergem com o tempo, e
 * divergência entre superfícies que deveriam concordar é exatamente o defeito que a SPEC-009
 * existiu para matar (o doctor e o hook diziam coisas diferentes sobre a mesma memória).
 *
 * Dois princípios, que valem para qualquer check novo em qualquer catálogo:
 *
 * 1. **Nunca colapsar causas distintas num booleano.** Um probe classifica a causa e devolve a
 *    correção *dela*. O bug que originou tudo isso era um `catch { return null }` que engolia três
 *    causas e prescrevia a correção de uma.
 * 2. **Uma causa, uma linha vermelha.** Check cuja dependência falhou é `skipped`, não `fail` —
 *    senão uma raiz vira três erros vermelhos e o operador não sabe qual perseguir.
 */

export type Severity = 'critical' | 'warn';
export type Scope = 'runtime' | 'repo';
export type Status = 'ok' | 'warn' | 'fail' | 'skipped';

export interface Probe {
  status: Status;
  /** O que foi observado, em uma linha. */
  detail: string;
  /** Comando exato que corrige. `null` quando não há o que corrigir. */
  fix?: string | null;
}

export interface Check {
  id: string;
  title: string;
  /** `critical` trava o gate; `warn` informa. */
  severity: Severity;
  /** Filtro opcional do runner. */
  scope?: Scope;
  /** Id de outro check. Se ele não passar, este vira `skipped`. */
  dependsOn?: string;
  /**
   * `env` é injetado e polimórfico entre os catálogos (health/release/doc) — daí `any`. Tipagem
   * por-catálogo com generics fica para uma fase posterior; o valor aqui é o contrato do resultado.
   */
  probe: (env: any) => Promise<Probe> | Probe;
}

export interface Result {
  id: string;
  title: string;
  severity: Severity;
  scope?: Scope;
  status: Status;
  detail: string;
  fix: string | null;
}

const SEVERITY_FALLBACK: Severity = 'critical';

/**
 * Estreita um valor capturado num `catch` (que o TS tipa como `unknown`) para a forma de erro do
 * Node — `code`/`message` opcionais. Não muda comportamento: só dá ao compilador o que o runtime
 * já assume ao ler `err.code`.
 *
 * @param {unknown} e
 * @returns {NodeJS.ErrnoException}
 */
export function asErrno(e) {
  return /** @type {NodeJS.ErrnoException} */ (e);
}

/**
 * Um probe que estoura é pior que probe nenhum: derrubaria o diagnóstico justamente no ambiente
 * quebrado que ele existe para diagnosticar. O runner blinda cada um e segue para o próximo.
 */
async function runProbe(check, env) {
  try {
    const probe = await check.probe(env);
    return {
      status: probe.status,
      detail: probe.detail,
      fix: probe.fix ?? null,
    };
  } catch (err) {
    const e = asErrno(err);
    return {
      status: 'fail',
      detail: `probe falhou: ${e.message || e}`,
      fix: null,
    };
  }
}

/**
 * Executa os checks na ordem declarada.
 *
 * @param {{ checks: Check[], scope?: Scope|'all', env?: object }} opts
 * @returns {Promise<Result[]>}
 */
export async function runChecks({ checks, scope = 'all', env = {} }) {
  const selected = checks.filter((c) => scope === 'all' || c.scope === scope);
  const statusById = new Map<string, Status>();
  const results: Result[] = [];

  for (const check of selected) {
    const base = {
      id: check.id,
      title: check.title,
      severity: check.severity || SEVERITY_FALLBACK,
      scope: check.scope,
    };

    // Cascata: sem a dependência de pé, este probe não tem o que observar. Propaga por cadeia, não
    // só um nível — `skipped` conta como "não verificado" para quem depende dele.
    const depStatus = check.dependsOn ? statusById.get(check.dependsOn) : null;
    if (depStatus === 'fail' || depStatus === 'skipped') {
      const motivo = depStatus === 'fail' ? 'que falhou' : 'que não foi verificado';
      results.push({
        ...base,
        status: 'skipped',
        detail: `não verificado: depende de "${check.dependsOn}", ${motivo}`,
        fix: null,
      });
      statusById.set(check.id, 'skipped');
      continue;
    }

    const probe = await runProbe(check, env);
    statusById.set(check.id, probe.status);
    results.push({ ...base, ...probe });
  }

  return results;
}

/**
 * Veredito agregado. Só `critical` reprova — um gate que trava por aquilo que não impede trabalho
 * é um gate que se aprende a ignorar, e aí ele para de proteger do que importa.
 *
 * @param {Result[]} results
 * @returns {'ok'|'warn'|'fail'}
 */
export function worstStatus(results) {
  let seenWarn = false;

  for (const r of results) {
    if (r.status === 'fail' && r.severity === 'critical') return 'fail';
    if (r.status === 'fail' || r.status === 'warn') seenWarn = true;
  }

  return seenWarn ? 'warn' : 'ok';
}

/**
 * Remove template literals do fonte antes de qualquer análise estática de `import`.
 *
 * Os geradores do Forja *escrevem* código NestJS dentro de crases — `import { Module } from
 * '@nestjs/common'` é texto que eles emitem, não dependência que eles usam. Contá-lo faz o check
 * acusar `@nestjs/core` como dependência não declarada e `./app.module` como import quebrado.
 * Observado em campo ao auditar o tarball da 1.1.3.
 */
export function stripTemplateLiterals(source) {
  return source.replace(/`(?:\\.|[^`\\])*`/gs, '``');
}
