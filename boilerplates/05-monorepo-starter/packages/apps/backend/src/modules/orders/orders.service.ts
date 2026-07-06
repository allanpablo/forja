import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderItem } from './entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto';
import type { OrderResponse, OrderListResponse, OrderItemResponse } from '@monorepo/shared-types';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemsRepository: Repository<OrderItem>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>
  ) {}

  async create(dto: CreateOrderDto, userId: string): Promise<OrderResponse> {
    let totalAmount = 0;
    const items: OrderItem[] = [];

    for (const item of dto.items) {
      const product = await this.productsRepository.findOne({ where: { id: item.productId } });
      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }
      if (product.stock_quantity < item.quantity) {
        throw new BadRequestException(`Insufficient stock for ${product.name}`);
      }

      const unitPrice = Number(product.price);
      totalAmount += unitPrice * item.quantity;

      const orderItem = this.orderItemsRepository.create({
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: unitPrice,
      });
      items.push(orderItem);

      product.stock_quantity -= item.quantity;
      await this.productsRepository.save(product);
    }

    const order = this.ordersRepository.create({
      user_id: userId,
      total_amount: totalAmount,
    });

    await this.ordersRepository.save(order);

    for (const item of items) {
      item.order_id = order.id;
      await this.orderItemsRepository.save(item);
    }

    return this.orderToResponse(order, items);
  }

  async findById(id: string): Promise<OrderResponse> {
    const order = await this.ordersRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const items = await this.orderItemsRepository.find({ where: { order_id: id } });
    return this.orderToResponse(order, items);
  }

  async findByUserId(userId: string, page = 1, limit = 10): Promise<OrderListResponse> {
    const [orders, total] = await this.ordersRepository.findAndCount({
      where: { user_id: userId },
      skip: (page - 1) * limit,
      take: limit,
    });

    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await this.orderItemsRepository.find({ where: { order_id: order.id } });
        return this.orderToResponse(order, items);
      })
    );

    return {
      orders: ordersWithItems,
      total,
      page,
    };
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto): Promise<OrderResponse> {
    const order = await this.ordersRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    order.status = dto.status;
    await this.ordersRepository.save(order);

    const items = await this.orderItemsRepository.find({ where: { order_id: id } });
    return this.orderToResponse(order, items);
  }

  private orderToResponse(order: Order, items: OrderItem[]): OrderResponse {
    return {
      id: order.id,
      userId: order.user_id,
      status: order.status,
      totalAmount: Number(order.total_amount),
      items: items.map(item => ({
        id: item.id,
        orderId: item.order_id,
        productId: item.product_id,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
      })),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }
}
