import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CurrentPrincipal, type Principal } from '../../../platform/auth/principal.js';
import { JwtAuthGuard } from '../../../platform/auth/jwt-auth.guard.js';
import { RequireRoles, RolesGuard } from '../../../platform/auth/roles.guard.js';
import { BillingService } from '../../application/billing.service.js';
import { PLAN_IDS, PLANS } from '../../domain/plan.js';

class ChangePlanDto {
  @ApiProperty({ enum: PLAN_IDS }) @IsIn([...PLAN_IDS]) plan: string;
}

@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  plans() {
    return Object.values(PLANS);
  }

  @Get('subscription')
  subscription(@CurrentPrincipal() p: Principal) {
    return this.billing.subscription(p.tenantId);
  }

  @Put('subscription/plan')
  @RequireRoles('owner')
  changePlan(@CurrentPrincipal() p: Principal, @Body() dto: ChangePlanDto) {
    return this.billing.changePlan(p.tenantId, dto.plan);
  }

  @Post('invoices/current')
  @HttpCode(200)
  @RequireRoles('owner', 'admin')
  issue(@CurrentPrincipal() p: Principal) {
    return this.billing.issueCurrentInvoice(p.tenantId);
  }

  @Get('invoices')
  @RequireRoles('owner', 'admin')
  invoices(@CurrentPrincipal() p: Principal) {
    return this.billing.listInvoices(p.tenantId);
  }

  @Get('invoices/:id')
  @RequireRoles('owner', 'admin')
  invoice(@CurrentPrincipal() p: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.billing.invoice(id, p.tenantId);
  }
}
