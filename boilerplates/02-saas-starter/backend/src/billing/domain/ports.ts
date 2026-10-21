import type { SubscriptionState } from './subscription.js';

export interface Invoice {
  readonly id: string;
  readonly tenantId: string;
  readonly number: string;
  readonly plan: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly status: 'open' | 'paid' | 'void';
  readonly issuedAt: Date;
}

export interface BillingRepository {
  findSubscription(tenantId: string): Promise<SubscriptionState | null>;
  saveSubscription(state: SubscriptionState): Promise<void>;
  findInvoiceForPeriod(tenantId: string, periodStart: Date): Promise<Invoice | null>;
  insertInvoice(invoice: Invoice): Promise<void>;
  listInvoices(tenantId: string): Promise<Invoice[]>;
  findInvoice(id: string, tenantId: string): Promise<Invoice | null>;
}

export const BILLING_REPOSITORY = Symbol('BILLING_REPOSITORY');
export const CLOCK = Symbol('CLOCK');
export type Clock = () => Date;
