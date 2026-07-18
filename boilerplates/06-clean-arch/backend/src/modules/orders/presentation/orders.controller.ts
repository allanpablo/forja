import { BadRequestException, Body, Controller, Param, Post } from '@nestjs/common';
import { PlaceOrderUseCase } from '../application/place-order.usecase';
import { ShipOrderUseCase } from '../application/ship-order.usecase';
import { PlaceOrderHttpDto } from './orders.http.dto';

/**
 * O controller é FINO. Ele traduz HTTP↔use-case e converte falha de domínio em erro HTTP — nada
 * mais. Zero regra de negócio aqui. Se você sentir vontade de colocar um `if` de regra no
 * controller, ele pertence ao domínio.
 */
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly placeOrder: PlaceOrderUseCase,
    private readonly shipOrder: ShipOrderUseCase,
  ) {}

  @Post()
  async place(@Body() dto: PlaceOrderHttpDto) {
    const result = await this.placeOrder.execute(dto);
    if (result.isFailure) throw new BadRequestException(result.error);
    return result.value;
  }

  @Post(':id/ship')
  async ship(@Param('id') id: string) {
    const result = await this.shipOrder.execute({ orderId: id });
    if (result.isFailure) throw new BadRequestException(result.error);
    return { ok: true };
  }
}
