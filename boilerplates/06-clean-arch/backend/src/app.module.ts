import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { OrderOrmEntity } from './modules/orders/infrastructure/order.orm-entity';
import { Product } from './modules/products/product.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [OrderOrmEntity, Product],
      synchronize: process.env.NODE_ENV !== 'production', // dev only
    }),
    OrdersModule,
    ProductsModule,
  ],
})
export class AppModule {}
