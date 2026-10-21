import { Module } from '@nestjs/common';
import { BillingService } from './application/billing.service.js';
import { BILLING_REPOSITORY, CLOCK } from './domain/ports.js';
import { TypeOrmBillingRepository } from './adapters/persistence/typeorm-billing.repository.js';
import { BillingController } from './adapters/http/billing.controller.js';

@Module({
  controllers: [BillingController],
  providers: [BillingService, { provide: BILLING_REPOSITORY, useClass: TypeOrmBillingRepository }, { provide: CLOCK, useValue: () => new Date() }],
})
export class BillingModule {}
