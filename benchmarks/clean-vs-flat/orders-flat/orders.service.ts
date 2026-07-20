import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Order, OrderLine, OrderStatus } from './order.entity';

/**
 * OrdersService (flat) — a MESMA feature de `modules/orders/`, colapsada numa camada. Regra de
 * negócio, orquestração e persistência convivem aqui. É o estilo ingênuo: rápido de escrever,
 * e o ponto de comparação de token do WHEN-CLEAN-WHEN-LEAN.
 *
 * Repare que a regra "não envia sem pagamento" e a máquina de estados estão espalhadas em `if`s
 * pelos métodos, misturadas com o acesso ao banco. Não há um lar único para a invariante, nem um
 * contrato legível separado da execução.
 */
interface PlaceOrderInput {
  customerId: string;
  items: Array<{ productId: string; unitPriceCents: number; quantity: number }>;
}

const LEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: [],
  CANCELLED: [],
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly repo: Repository<Order>,
  ) {}

  async place(input: PlaceOrderInput): Promise<{ orderId: string; totalCents: number }> {
    // Regra: precisa de ao menos um item, com quantidade positiva.
    if (!input.items || input.items.length === 0) {
      throw new BadRequestException('um pedido precisa de ao menos um item');
    }
    if (input.items.some((i) => i.quantity <= 0)) {
      throw new BadRequestException('quantidade de item deve ser positiva');
    }

    // Total derivado das linhas (mas nada impede alguém de setar totalCents direto depois).
    const totalCents = input.items.reduce((acc, i) => acc + i.unitPriceCents * i.quantity, 0);
    const lines: OrderLine[] = input.items.map((i) => ({
      productId: i.productId,
      unitPriceCents: i.unitPriceCents,
      quantity: i.quantity,
    }));

    const order = this.repo.create({
      id: randomUUID(),
      customerId: input.customerId,
      lines,
      status: 'CONFIRMED', // rascunho → confirmado, direto (a transição legal não é checada aqui)
      totalCents,
    });
    await this.repo.save(order);
    return { orderId: order.id, totalCents };
  }

  async pay(orderId: string): Promise<void> {
    const order = await this.repo.findOneBy({ id: orderId });
    if (!order) throw new NotFoundException('pedido não encontrado');
    this.assertTransition(order.status, 'PAID');
    order.status = 'PAID';
    await this.repo.save(order);
  }

  async ship(orderId: string): Promise<void> {
    const order = await this.repo.findOneBy({ id: orderId });
    if (!order) throw new NotFoundException('pedido não encontrado');
    // Invariante-chave, aqui como um if no meio do service: não envia sem pagamento.
    if (order.status !== 'PAID') {
      throw new BadRequestException(`não envia um pedido em ${order.status}: só a partir de PAID`);
    }
    order.status = 'SHIPPED';
    await this.repo.save(order);
  }

  async cancel(orderId: string): Promise<void> {
    const order = await this.repo.findOneBy({ id: orderId });
    if (!order) throw new NotFoundException('pedido não encontrado');
    this.assertTransition(order.status, 'CANCELLED');
    order.status = 'CANCELLED';
    await this.repo.save(order);
  }

  private assertTransition(from: OrderStatus, to: OrderStatus): void {
    if (!LEGAL_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(`transição inválida: ${from} → ${to}`);
    }
  }
}
