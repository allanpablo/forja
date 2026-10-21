import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { SubscriptionState } from '../domain/subscription.js';
import type { BillingRepository, Invoice } from '../domain/ports.js';
import { BillingService } from './billing.service.js';

class InMemoryBilling implements BillingRepository {
  subs = new Map<string, SubscriptionState>();
  invoices: Invoice[] = [];
  async findSubscription(t: string) { return this.subs.get(t) ?? null; }
  async saveSubscription(s: SubscriptionState) { this.subs.set(s.tenantId, s); }
  async findInvoiceForPeriod(t: string, start: Date) { return this.invoices.find((i) => i.tenantId === t && i.periodStart.getTime() === start.getTime()) ?? null; }
  async insertInvoice(i: Invoice) { this.invoices.push(i); }
  async listInvoices(t: string) { return this.invoices.filter((i) => i.tenantId === t); }
  async findInvoice(id: string, t: string) { return this.invoices.find((i) => i.id === id && i.tenantId === t) ?? null; }
}

const setup = (at = new Date('2026-05-10T12:00:00Z')) => {
  const repo = new InMemoryBilling();
  return { repo, billing: new BillingService(repo, () => at, { currency: 'BRL' }) };
};

describe('BillingService', () => {
  it('cria a assinatura free na primeira consulta e devolve a mesma depois', async () => {
    const { billing } = setup();
    const a = await billing.subscription('t1');
    expect(a.plan).toBe('free');
    expect((await billing.subscription('t1')).id).toBe(a.id);
  });

  it('plano desconhecido → 400; transição proibida → 422', async () => {
    const { billing } = setup();
    await expect(billing.changePlan('t1', 'gold')).rejects.toBeInstanceOf(BadRequestException);
    await billing.changePlan('t1', 'enterprise');
    await expect(billing.changePlan('t1', 'free')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('fatura usa o preço do plano em centavos e é idempotente no período', async () => {
    const { billing, repo } = setup();
    await billing.changePlan('t1', 'pro');
    const first = await billing.issueCurrentInvoice('t1');
    const again = await billing.issueCurrentInvoice('t1');
    expect(first).toMatchObject({ amountCents: 9900, currency: 'BRL', status: 'open', plan: 'pro' });
    expect(again.id).toBe(first.id);
    expect(repo.invoices).toHaveLength(1);
  });

  it('fatura do plano free nasce paga, com valor zero', async () => {
    const { billing } = setup();
    expect(await billing.issueCurrentInvoice('t1')).toMatchObject({ amountCents: 0, status: 'paid' });
  });

  it('isolamento: fatura de outro tenant responde 404 e não aparece na lista', async () => {
    const { billing } = setup();
    const inv = await billing.issueCurrentInvoice('t1');
    await expect(billing.invoice(inv.id, 't2')).rejects.toBeInstanceOf(NotFoundException);
    expect(await billing.listInvoices('t2')).toEqual([]);
  });
});
