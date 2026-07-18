import { Inject, Injectable } from '@nestjs/common';
import { ORDER_REPOSITORY, OrderRepository } from '../domain/order.repository';
import { Result } from '../../../shared/result';

export interface ShipOrderInput {
  orderId: string;
}

/**
 * ShipOrder — demonstra a invariante-chave passando pelo domínio: `order.ship()` **falha** se o
 * pedido não estiver PAID. O use-case não reimplementa a regra; ele confia no agregado e propaga a
 * falha. A regra "não envia sem pagamento" existe num lugar só: `Order`.
 */
@Injectable()
export class ShipOrderUseCase {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository) {}

  async execute(input: ShipOrderInput): Promise<Result<void>> {
    const order = await this.orders.byId(input.orderId);
    if (!order) return Result.fail('pedido não encontrado');

    const shipped = order.ship(); // domínio decide: só sai de PAID
    if (shipped.isFailure) return Result.fail(shipped.error!);

    await this.orders.save(order);
    return Result.ok(undefined);
  }
}
