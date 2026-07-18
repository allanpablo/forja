import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Order, OrderLine } from '../domain/order.entity';
import { Money } from '../domain/money.vo';
import { ORDER_REPOSITORY, OrderRepository } from '../domain/order.repository';
import { Result } from '../../../shared/result';

/**
 * Contratos de entrada/saída — tipados e legíveis. Um agente entende o que o use-case faz pela
 * assinatura, **sem ler o corpo** (AC-5). É a compressão de contexto: o tipo é o resumo.
 */
export interface PlaceOrderInput {
  customerId: string;
  items: Array<{ productId: string; unitPriceCents: number; quantity: number }>;
}
export interface PlaceOrderOutput {
  orderId: string;
  totalCents: number;
}

/**
 * PlaceOrder — orquestra o domínio + a porta. O use-case não tem regra de negócio própria: ele
 * traduz o input, chama o agregado (que decide), e persiste via porta. A regra ("precisa de itens")
 * é do `Order`, não daqui.
 */
@Injectable()
export class PlaceOrderUseCase {
  // Injeta a PORTA (token), nunca o adapter concreto — a inversão de dependência.
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository) {}

  async execute(input: PlaceOrderInput): Promise<Result<PlaceOrderOutput>> {
    const lines: OrderLine[] = input.items.map((i) => ({
      productId: i.productId,
      unitPrice: Money.of(i.unitPriceCents),
      quantity: i.quantity,
    }));

    const created = Order.place(randomUUID(), input.customerId, lines);
    if (created.isFailure) return Result.fail(created.error!);

    const order = created.value;
    order.confirm(); // rascunho → confirmado (a máquina de estados do domínio valida)
    await this.orders.save(order);

    return Result.ok({ orderId: order.id, totalCents: order.total.cents });
  }
}
