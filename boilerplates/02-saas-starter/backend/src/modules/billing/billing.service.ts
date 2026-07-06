import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from './entities/invoice.entity';
import { v4 as uuid } from 'uuid';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
  ) {}

  async charge(organizationId: string, tenantId: string, amount: number, description: string) {
    // Mock payment gateway (90% success rate)
    const success = Math.random() > 0.1;
    
    if (!success) {
      throw new Error('Payment failed (mock)');
    }

    const invoice = this.invoiceRepository.create({
      organizationId,
      tenantId,
      invoiceNumber: `INV-${Date.now()}-${uuid().slice(0, 8)}`,
      amount,
      currency: 'USD',
      status: 'paid',
      description,
      issuedAt: new Date(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      paidAt: new Date(),
      items: [{ description, amount, quantity: 1 }],
    });

    return this.invoiceRepository.save(invoice);
  }

  async getInvoices(organizationId: string, tenantId: string) {
    return this.invoiceRepository.find({
      where: { organizationId, tenantId },
      order: { issuedAt: 'DESC' },
    });
  }

  async getInvoiceById(invoiceId: string, tenantId: string) {
    return this.invoiceRepository.findOne({
      where: { id: invoiceId, tenantId },
    });
  }

  async createInvoice(organizationId: string, tenantId: string, amount: number, description: string) {
    const invoice = this.invoiceRepository.create({
      organizationId,
      tenantId,
      invoiceNumber: `INV-${Date.now()}-${uuid().slice(0, 8)}`,
      amount,
      currency: 'USD',
      status: 'pending',
      description,
      issuedAt: new Date(),
      items: [{ description, amount, quantity: 1 }],
    });

    return this.invoiceRepository.save(invoice);
  }
}
