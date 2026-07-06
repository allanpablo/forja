import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('invoices')
@Index(['organizationId'])
@Index(['tenantId'])
@Index(['tenantId', 'status'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  @Column('uuid')
  tenantId: string;

  @Column({ unique: true })
  invoiceNumber: string;

  @Column('uuid', { nullable: true })
  subscriptionId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ default: 'pending' })
  status: string;

  @Column({ nullable: true })
  description: string;

  @Column('jsonb', { nullable: true })
  items: any[];

  @Column()
  issuedAt: Date;

  @Column({ nullable: true })
  dueDate: Date;

  @Column({ nullable: true })
  paidAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
