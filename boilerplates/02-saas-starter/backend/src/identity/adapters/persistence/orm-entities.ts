import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('organizations')
export class OrganizationOrm {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid', { unique: true }) tenantId: string;
  @Column('varchar', { length: 120 }) name: string;
  @Column('varchar', { length: 64, unique: true }) slug: string;
  @Column('uuid') ownerId: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('users')
@Index(['tenantId'])
export class UserOrm {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') tenantId: string;
  @Column('varchar', { length: 254, unique: true }) email: string;
  @Column('varchar', { length: 255 }) passwordHash: string;
  @Column('simple-array') roles: string[];
  @Column('boolean', { default: true }) active: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
