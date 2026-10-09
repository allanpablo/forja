import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ORDER_REPOSITORY } from './domain/order.repository.js';
import { OrderOrmEntity } from './infrastructure/order.orm-entity.js';
import { TypeOrmOrderRepository } from './infrastructure/typeorm-order.repository.js';
import { PlaceOrderUseCase } from './application/place-order.usecase.js';
import { ShipOrderUseCase } from './application/ship-order.usecase.js';
import { OrdersController } from './presentation/orders.controller.js';

/**
 * O módulo é onde a **inversão de dependência** acontece, numa linha:
 *
 *   { provide: ORDER_REPOSITORY, useClass: TypeOrmOrderRepository }
 *
 * O use-case pede o token `ORDER_REPOSITORY` (a porta do domínio); o Nest entrega o adapter TypeORM.
 * Trocar de persistência = trocar o `useClass` aqui, e nada mais. O domínio e a aplicação não sabem
 * que TypeORM existe.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OrderOrmEntity])],
  controllers: [OrdersController],
  providers: [
    PlaceOrderUseCase,
    ShipOrderUseCase,
    { provide: ORDER_REPOSITORY, useClass: TypeOrmOrderRepository },
  ],
})
export class OrdersModule {}
