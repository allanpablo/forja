import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('organizations')
@Index(['tenantId'])
@Index(['ownerId'])
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { unique: true })
  tenantId: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column('uuid')
  ownerId: string;

  @Column({ default: 'free' })
  plan: string;

  @Column({ nullable: true })
  stripeCustomerId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  deletedAt: Date;
}
