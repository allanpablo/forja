import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrganizationsService } from './organizations.service';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('organizations')
@UseGuards(AuthGuard('jwt'))
export class OrganizationsController {
  constructor(private orgsService: OrganizationsService) {}

  @Get()
  async getOrganization(@TenantId() tenantId: string) {
    const org = await this.orgsService.findByTenantId(tenantId);
    return { data: org };
  }
}
