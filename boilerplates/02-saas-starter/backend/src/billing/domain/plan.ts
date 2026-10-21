/**
 * Política de planos: preço em centavos (inteiro, nunca float), limites e transições permitidas.
 * Mudar um preço ou uma regra de transição é mudar este arquivo, e os testes dizem o que quebrou.
 */
export const PLAN_IDS = ['free', 'pro', 'enterprise'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  readonly id: PlanId;
  readonly monthlyPriceCents: number;
  /** null = sem limite. */
  readonly apiCallsPerMonth: number | null;
  readonly seats: number | null;
}

export const PLANS: Readonly<Record<PlanId, Plan>> = {
  free: { id: 'free', monthlyPriceCents: 0, apiCallsPerMonth: 1_000, seats: 3 },
  pro: { id: 'pro', monthlyPriceCents: 9_900, apiCallsPerMonth: 100_000, seats: 25 },
  // Enterprise é negociado: preço por contrato, não por tabela.
  enterprise: { id: 'enterprise', monthlyPriceCents: 0, apiCallsPerMonth: null, seats: null },
};

const TRANSITIONS: Readonly<Record<PlanId, readonly PlanId[]>> = {
  free: ['pro', 'enterprise'],
  pro: ['free', 'enterprise'],
  // Sair do enterprise passa por contrato, não por autoatendimento.
  enterprise: [],
};

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

export function canChangePlan(from: PlanId, to: PlanId): boolean {
  return TRANSITIONS[from].includes(to);
}
