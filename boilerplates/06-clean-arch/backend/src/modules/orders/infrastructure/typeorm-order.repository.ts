import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderLine } from '../domain/order.entity.js';
import { Money } from '../domain/money.vo.js';
import { OrderStatus, OrderStatusValue } from '../domain/order-status.vo.js';
import { OrderRepository } from '../domain/order.repository.js';
import { OrderOrmEntity } from './order.orm-entity.js';

/**
 * O ADAPTER: implementa a porta `OrderRepository` do domínio usando TypeORM. É o único lugar que
 * conhece o ORM. O **mapper** (toDomain/toOrm) traduz entre o agregado puro e a orm-entity — a
 * fronteira que impede o TypeORM de vazar para dentro.
 */
@Injectable()
export class TypeOrmOrderRepository implements OrderRepository {
  constructor(
    @InjectRepository(OrderOrmEntity)
    private readonly repo: Repository<OrderOrmEntity>,
  ) {}

  async save(order: Order): Promise<void> {
    await this.repo.save(this.toOrm(order));
  }

  async byId(id: string): Promise<Order | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  private toOrm(order: Order): OrderOrmEntity {
    const row = new OrderOrmEntity();
    row.id = order.id;
    row.customerId = order.customerId;
    row.status = order.status.value;
    row.lines = order.lines.map((l) => ({
      productId: l.productId,
      unitPriceCents: l.unitPrice.cents,
      quantity: l.quantity,
    }));
    return row;
  }

  private toDomain(row: OrderOrmEntity): Order {
    const lines: OrderLine[] = row.lines.map((l) => ({
      productId: l.productId,
      unitPrice: Money.of(l.unitPriceCents),
      quantity: l.quantity,
    }));
    return Order.rehydrate(
      row.id,
      row.customerId,
      lines,
      OrderStatus.from(row.status as OrderStatusValue),
    );
  }
}
