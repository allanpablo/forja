import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductsController } from './products.controller';

/** CRUD enxuto: só o controller e a entity. Sem providers de porta/adapter — não há o que inverter. */
@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [ProductsController],
})
export class ProductsModule {}
