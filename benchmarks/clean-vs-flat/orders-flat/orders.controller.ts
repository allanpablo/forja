import { Body, Controller, Param, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';

/**
 * OrdersController (flat) — chama o service direto. No estilo ingênuo o controller costuma engordar
 * (validação, montagem de resposta, às vezes um `if` de regra que vaza pra cá). Aqui mantido fino
 * para uma comparação justa com a fatia em camadas.
 */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  async place(@Body() dto: { customerId: string; items: Array<{ productId: string; unitPriceCents: number; quantity: number }> }) {
    return this.orders.place(dto);
  }

  @Post(':id/ship')
  async ship(@Param('id') id: string) {
    await this.orders.ship(id);
    return { ok: true };
  }
}
