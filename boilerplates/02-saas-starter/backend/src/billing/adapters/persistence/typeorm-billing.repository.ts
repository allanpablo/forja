import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isPlanId } from '../../domain/plan.js';
import type { SubscriptionState } from '../../domain/subscription.js';
import type { BillingRepository, Invoice } from '../../domain/ports.js';
import { InvoiceOrm, SubscriptionOrm } from './orm-entities.js';

const toInvoice = (r: InvoiceOrm): Invoice => ({
  id: r.id, tenantId: r.tenantId, number: r.number, plan: r.plan, amountCents: r.amountCents, currency: r.currency,
  periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status, issuedAt: r.issuedAt,
});

@Injectable()
export class TypeOrmBillingRepository implements BillingRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async findSubscription(tenantId: string): Promise<SubscriptionState | null> {
    const r = await this.ds.getRepository(SubscriptionOrm).findOneBy({ tenantId });
    if (!r) return null;
    if (!isPlanId(r.plan)) throw new Error(`Plano inválido no banco: ${r.plan}`);
    return { id: r.id, tenantId: r.tenantId, plan: r.plan, periodStart: r.periodStart, periodEnd: r.periodEnd };
  }

  async saveSubscription(state: SubscriptionState): Promise<void> {
    await this.ds.getRepository(SubscriptionOrm).save({ ...state });
  }

  async findInvoiceForPeriod(tenantId: string, periodStart: Date): Promise<Invoice | null> {
    const r = await this.ds.getRepository(InvoiceOrm).findOneBy({ tenantId, periodStart });
    return r ? toInvoice(r) : null;
  }

  async insertInvoice(invoice: Invoice): Promise<void> {
    await this.ds.getRepository(InvoiceOrm).insert({ ...invoice });
  }

  async listInvoices(tenantId: string): Promise<Invoice[]> {
    return (await this.ds.getRepository(InvoiceOrm).find({ where: { tenantId }, order: { periodStart: 'DESC' } })).map(toInvoice);
  }

  async findInvoice(id: string, tenantId: string): Promise<Invoice | null> {
    const r = await this.ds.getRepository(InvoiceOrm).findOneBy({ id, tenantId });
    return r ? toInvoice(r) : null;
  }
}
