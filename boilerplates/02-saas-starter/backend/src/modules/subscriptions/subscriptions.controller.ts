import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubscriptionsService } from './subscriptions.service';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('subscriptions')
@UseGuards(AuthGuard('jwt'))
export class SubscriptionsController {
  constructor(private subsService: SubscriptionsService) {}

  @Get()
  async get(@TenantId() tenantId: string, @Body() req: any) {
    const org = req.user.organization;
    const sub = await this.subsService.getOrCreate(org.id, tenantId);
    return { data: sub };
  }

  @Post(':id/upgrade')
  async upgrade(
    @Param('id') id: string,
    @Body() body: { newPlan: string },
    @TenantId() tenantId: string,
    @Body() req: any,
  ) {
    const org = req.user.organization;
    const upgraded = await this.subsService.upgrade(org.id, tenantId, body.newPlan);
    return { data: upgraded };
  }

  @Get('usage')
  async getUsage(@TenantId() tenantId: string, @Body() req: any) {
    const org = req.user.organization;
    const usage = await this.subsService.getUsage(org.id, tenantId);
    return { data: usage };
  }
}
