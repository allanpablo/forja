import { BadRequestException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../platform/config.js';
import { isPlanId, PLANS } from '../domain/plan.js';
import { InvalidPlanChange, Subscription, monthlyPeriod, type SubscriptionState } from '../domain/subscription.js';
import { BILLING_REPOSITORY, CLOCK, type BillingRepository, type Clock, type Invoice } from '../domain/ports.js';

@Injectable()
export class BillingService {
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repo: BillingRepository,
    @Inject(CLOCK) private readonly now: Clock,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'currency'>,
  ) {}

  /** A assinatura do tenant; criada no plano free na primeira consulta. */
  async subscription(tenantId: string): Promise<SubscriptionState> {
    const existing = await this.repo.findSubscription(tenantId);
    if (existing) return existing;
    const created = Subscription.start(randomUUID(), tenantId, this.now()).snapshot;
    await this.repo.saveSubscription(created);
    return created;
  }

  async changePlan(tenantId: string, plan: string): Promise<SubscriptionState> {
    if (!isPlanId(plan)) throw new BadRequestException(`Plano desconhecido: ${plan}`);
    const sub = Subscription.restore(await this.subscription(tenantId));
    try {
      sub.changePlan(plan);
    } catch (error) {
      if (error instanceof InvalidPlanChange) throw new UnprocessableEntityException(error.message);
      throw error;
    }
    await this.repo.saveSubscription(sub.snapshot);
    return sub.snapshot;
  }

  /**
   * Emite a fatura do período atual a partir do plano. Idempotente por período: chamar de novo devolve
   * a mesma fatura. O valor vem da tabela de planos, nunca do cliente.
   */
  async issueCurrentInvoice(tenantId: string): Promise<Invoice> {
    const sub = await this.subscription(tenantId);
    const { start, end } = monthlyPeriod(this.now());
    const existing = await this.repo.findInvoiceForPeriod(tenantId, start);
    if (existing) return existing;
    const plan = PLANS[sub.plan];
    const issuedAt = this.now();
    const invoice: Invoice = {
      id: randomUUID(), tenantId, plan: plan.id, amountCents: plan.monthlyPriceCents, currency: this.config.currency,
      number: `INV-${start.toISOString().slice(0, 7)}-${tenantId.slice(0, 8)}`,
      periodStart: start, periodEnd: end, status: plan.monthlyPriceCents === 0 ? 'paid' : 'open', issuedAt,
    };
    await this.repo.insertInvoice(invoice);
    return invoice;
  }

  listInvoices(tenantId: string): Promise<Invoice[]> {
    return this.repo.listInvoices(tenantId);
  }

  /** Fatura de outro tenant responde 404, como se não existisse. */
  async invoice(id: string, tenantId: string): Promise<Invoice> {
    const found = await this.repo.findInvoice(id, tenantId);
    if (!found) throw new NotFoundException('Fatura não encontrada');
    return found;
  }
}
