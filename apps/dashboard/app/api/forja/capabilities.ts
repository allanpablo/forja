/**
 * Pure helpers backing the dashboard's read-only capability access, same pattern as `guard.ts`
 * and `approval.ts`: no Next types in here, so the rules are unit-testable directly.
 *
 * ADR-0022 congelou o dashboard anterior porque ele mantinha uma allowlist de comandos própria,
 * paralela ao registry — e nela existia comando que o registry não tinha, executado por fora dos
 * gates e da trilha de auditoria. A condição de retomada #2 era derivar a exposição do registry.
 * Aqui não há lista: o que o painel pode executar é decidido pelo que o próprio servidor declara
 * em `/api/capabilities`, filtrado pela regra abaixo.
 */

/** O mínimo de uma `CapabilityDefinition` (packages/contracts) que a regra precisa. */
export interface CapabilitySurface {
  readonly id: string;
  readonly permissions: readonly string[];
  readonly sideEffects: readonly string[];
}

/**
 * Read-only de verdade: sem permissão de escrita e sem efeito colateral declarado. `risk` não
 * entra na regra porque é julgamento do autor da capacidade, não um fato sobre o que ela toca —
 * `context.budget` é risk low e ainda assim grava `context_run_record`. Definição que não declara
 * os dois campos é recusada: o portão falha fechado, não por falta de evidência de que escreve.
 */
export function isReadOnlyCapability(capability: CapabilitySurface | null): boolean {
  if (capability === null) return false;
  if (!Array.isArray(capability.permissions) || !Array.isArray(capability.sideEffects)) return false;
  if (capability.permissions.includes('write')) return false;
  return capability.sideEffects.length === 0;
}

/** `/capabilities/spec.validate/execute` → `spec.validate`; qualquer outra forma → null. */
export function capabilityIdFromExecutePath(pathname: string): string | null {
  const prefix = '/capabilities/';
  const suffix = '/execute';
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return null;
  const id = pathname.slice(prefix.length, -suffix.length);
  if (id.length === 0 || id.includes('/')) return null;
  return id;
}

export function isCapabilityListPath(pathname: string): boolean {
  return pathname === '/capabilities';
}
