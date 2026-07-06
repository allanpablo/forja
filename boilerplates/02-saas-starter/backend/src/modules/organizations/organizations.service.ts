import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { v4 as uuid } from 'uuid';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private orgRepository: Repository<Organization>,
  ) {}

  async findByTenantId(tenantId: string) {
    return this.orgRepository.findOne({ where: { tenantId } });
  }

  async create(name: string, ownerId: string) {
    const tenantId = uuid();
    const org = this.orgRepository.create({
      tenantId,
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      ownerId,
      plan: 'free',
    });
    return this.orgRepository.save(org);
  }

  async updatePlan(tenantId: string, plan: string) {
    await this.orgRepository.update({ tenantId }, { plan });
    return this.findByTenantId(tenantId);
  }
}
