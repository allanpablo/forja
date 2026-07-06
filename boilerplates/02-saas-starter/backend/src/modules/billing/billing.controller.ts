import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BillingService } from './billing.service';
import { TenantId } from '../../common/decorators/tenant.decorator';

@Controller('billing')
@UseGuards(AuthGuard('jwt'))
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Post('charge')
  async charge(
    @Body() body: { amount: number; description: string },
    @TenantId() tenantId: string,
    @Body() req: any,
  ) {
    const org = req.user.organization;
    const invoice = await this.billingService.charge(
      org.id,
      tenantId,
      body.amount,
      body.description,
    );
    return { data: invoice };
  }

  @Get('invoices')
  async getInvoices(@TenantId() tenantId: string, @Body() req: any) {
    const org = req.user.organization;
    const invoices = await this.billingService.getInvoices(org.id, tenantId);
    return { data: invoices };
  }

  @Get('invoices/:id')
  async getInvoice(
    @Param('id') invoiceId: string,
    @TenantId() tenantId: string,
  ) {
    const invoice = await this.billingService.getInvoiceById(invoiceId, tenantId);
    return { data: invoice };
  }
}
