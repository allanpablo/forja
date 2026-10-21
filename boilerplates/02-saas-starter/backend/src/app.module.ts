import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from './platform/config.js';
import { PlatformModule } from './platform/platform.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { BillingModule } from './billing/billing.module.js';
import { OrganizationOrm, UserOrm } from './identity/adapters/persistence/orm-entities.js';
import { InvoiceOrm, SubscriptionOrm } from './billing/adapters/persistence/orm-entities.js';

@Module({
  imports: [
    PlatformModule,
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        type: 'postgres',
        url: config.databaseUrl,
        entities: [OrganizationOrm, UserOrm, SubscriptionOrm, InvoiceOrm],
        // Em produção o esquema muda por migração (skill data-migrations), nunca por synchronize.
        synchronize: !config.production,
      }),
    }),
    IdentityModule,
    BillingModule,
  ],
})
export class AppModule {}
