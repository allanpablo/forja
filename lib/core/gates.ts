/**
 * lib/core/gates.ts — a bateria inteira, um veredito (SPEC-020).
 *
 * O framework acumulou uma família de gates — doctor (núcleo + coerência), release (tarball), smoke
 * (projeto gerado). Cada um guarda uma fronteira, mas rodá-los todos era disciplina: a governança que
 * existe para não depender de memória dependia da memória de quem lembra de invocar os gates.
 *
 * Este módulo **compõe** os runners que já existem — não reimplementa nenhum check. Uma máquina que
 * chama as outras máquinas, e reduz tudo a um `worstStatus`.
 */

import { runChecks as runHealthChecks, worstStatus } from './health.ts';
import { runProjectSmoke } from './project-smoke.ts';
import { runReleaseChecks } from './release.ts';
import { runDriftGate } from './drift-gate.ts';
import { runArchitectureGate } from './architecture-gate.ts';

export interface GateGroup {
  name: string;
  results: any[];
}

/** Runners injetáveis — em produção, os catálogos reais; no teste, fakes com status conhecidos. */
export interface GatesDeps {
  health?: () => Promise<any[]>;
  smoke?: (opts: { full: boolean }) => Promise<any[]>;
  release?: () => Promise<any[]>;
  drift?: () => Promise<any[]>;
  architecture?: () => Promise<any[]>;
}

/**
 * Roda os gates aplicáveis ao framework e devolve os resultados agrupados por gate.
 *
 * Tier barato (default): coerência (doctor) + projeto gerado (smoke barato). `--full` adiciona os
 * caros: o tarball (release) e o build do gerado (smoke --full). `--with-drift` (SPEC-030 AC-5) é
 * um terceiro eixo, independente de `full`: reindexa o workspace inteiro por extração
 * determinística — não é caro na mesma escala do tarball, mas também não é grátis o bastante para
 * rodar em todo commit sem medição, daí opt-in em vez de padrão.
 */
export async function runGates(
  { full = false, withDrift = false, withArchitecture = false, deps = {} }: { full?: boolean; withDrift?: boolean; withArchitecture?: boolean; deps?: GatesDeps } = {}
): Promise<GateGroup[]> {
  const health = deps.health ?? (() => runHealthChecks());
  const smoke = deps.smoke ?? ((o: { full: boolean }) => runProjectSmoke(o));
  const release = deps.release ?? (() => runReleaseChecks({}));
  const drift = deps.drift ?? (() => runDriftGate());
  const architecture = deps.architecture ?? (() => runArchitectureGate());

  const groups: GateGroup[] = [];
  groups.push({ name: 'núcleo & coerência', results: await health() });
  groups.push({ name: 'projeto gerado', results: await smoke({ full }) });
  if (full) groups.push({ name: 'tarball (instalação limpa)', results: await release() });
  if (withDrift) groups.push({ name: 'drift sentinel (opt-in, SPEC-030)', results: await drift() });
  if (withArchitecture) groups.push({ name: 'architecture constitution (opt-in, SPEC-033)', results: await architecture() });
  return groups;
}

/** O pior status entre todos os gates — o veredito único. */
export function overallStatus(groups: GateGroup[]): string {
  return worstStatus(groups.flatMap((g) => g.results));
}

export { worstStatus };
