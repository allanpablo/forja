import { canChangePlan, type PlanId } from './plan.js';

export class InvalidPlanChange extends Error {
  constructor(readonly from: PlanId, readonly to: PlanId) {
    super(`Mudança de plano não permitida: ${from} → ${to}`);
    this.name = 'InvalidPlanChange';
  }
}

export interface SubscriptionState {
  readonly id: string;
  readonly tenantId: string;
  readonly plan: PlanId;
  readonly periodStart: Date;
  readonly periodEnd: Date;
}

/** Período mensal em UTC que contém `at`: [primeiro dia do mês, primeiro dia do mês seguinte). */
export function monthlyPeriod(at: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  return { start, end };
}

/** Agregado Assinatura: um por tenant; a mudança de plano respeita a política de transições. */
export class Subscription {
  private constructor(private state: SubscriptionState) {}

  static start(id: string, tenantId: string, at: Date): Subscription {
    const { start, end } = monthlyPeriod(at);
    return new Subscription({ id, tenantId, plan: 'free', periodStart: start, periodEnd: end });
  }

  static restore(state: SubscriptionState): Subscription {
    return new Subscription(state);
  }

  get snapshot(): SubscriptionState {
    return this.state;
  }

  changePlan(to: PlanId): void {
    if (to === this.state.plan) return;
    if (!canChangePlan(this.state.plan, to)) throw new InvalidPlanChange(this.state.plan, to);
    this.state = { ...this.state, plan: to };
  }
}
