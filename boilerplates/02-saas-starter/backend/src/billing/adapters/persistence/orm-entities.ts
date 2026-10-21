import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('subscriptions')
export class SubscriptionOrm {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid', { unique: true }) tenantId: string;
  @Column('varchar', { length: 20 }) plan: string;
  @Column('timestamptz') periodStart: Date;
  @Column('timestamptz') periodEnd: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('invoices')
@Index(['tenantId', 'periodStart'], { unique: true })
export class InvoiceOrm {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') tenantId: string;
  @Column('varchar', { length: 40, unique: true }) number: string;
  @Column('varchar', { length: 20 }) plan: string;
  /** Centavos, inteiro. */
  @Column('integer') amountCents: number;
  @Column('char', { length: 3 }) currency: string;
  @Column('timestamptz') periodStart: Date;
  @Column('timestamptz') periodEnd: Date;
  @Column('varchar', { length: 10 }) status: 'open' | 'paid' | 'void';
  @Column('timestamptz') issuedAt: Date;
}
