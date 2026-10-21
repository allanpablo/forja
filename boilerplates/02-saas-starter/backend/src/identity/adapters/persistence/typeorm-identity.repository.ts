import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ROLES, type Role } from '../../../platform/auth/principal.js';
import type { IdentityRepository, Organization, User } from '../../domain/model.js';
import { OrganizationOrm, UserOrm } from './orm-entities.js';

const toUser = (row: UserOrm): User => ({
  id: row.id, tenantId: row.tenantId, email: row.email, passwordHash: row.passwordHash, active: row.active,
  roles: row.roles.filter((r): r is Role => (ROLES as readonly string[]).includes(r)),
});
const toOrg = (row: OrganizationOrm): Organization => ({ id: row.id, tenantId: row.tenantId, name: row.name, slug: row.slug, ownerId: row.ownerId });

@Injectable()
export class TypeOrmIdentityRepository implements IdentityRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async findUserByEmail(email: string): Promise<User | null> {
    const row = await this.ds.getRepository(UserOrm).findOneBy({ email });
    return row ? toUser(row) : null;
  }

  async findUserById(id: string, tenantId: string): Promise<User | null> {
    const row = await this.ds.getRepository(UserOrm).findOneBy({ id, tenantId });
    return row ? toUser(row) : null;
  }

  async listUsers(tenantId: string): Promise<User[]> {
    return (await this.ds.getRepository(UserOrm).find({ where: { tenantId }, order: { createdAt: 'ASC' } })).map(toUser);
  }

  async findOrganization(tenantId: string): Promise<Organization | null> {
    const row = await this.ds.getRepository(OrganizationOrm).findOneBy({ tenantId });
    return row ? toOrg(row) : null;
  }

  async slugTaken(slug: string): Promise<boolean> {
    return (await this.ds.getRepository(OrganizationOrm).countBy({ slug })) > 0;
  }

  async createTenant(org: Organization, owner: User): Promise<void> {
    await this.ds.transaction(async (tx) => {
      await tx.getRepository(OrganizationOrm).insert({ ...org });
      await tx.getRepository(UserOrm).insert({ ...owner, roles: [...owner.roles] });
    });
  }
}
