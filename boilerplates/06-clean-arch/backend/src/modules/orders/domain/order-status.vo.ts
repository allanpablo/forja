/**
 * OrderStatus — value object que é uma máquina de estados. As transições legais moram AQUI, no
 * domínio, não num `if` espalhado pelos services. Um estado inválido é impossível de construir.
 *
 *   DRAFT ──confirm──► CONFIRMED ──pay──► PAID ──ship──► SHIPPED
 *     └──────────────── cancel ──────────────► CANCELLED (de qualquer não-enviado)
 */
export type OrderStatusValue = 'DRAFT' | 'CONFIRMED' | 'PAID' | 'SHIPPED' | 'CANCELLED';

const TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: [],
  CANCELLED: [],
};

export class OrderStatus {
  private constructor(public readonly value: OrderStatusValue) {}

  static draft(): OrderStatus {
    return new OrderStatus('DRAFT');
  }

  static from(value: OrderStatusValue): OrderStatus {
    return new OrderStatus(value);
  }

  canTransitionTo(next: OrderStatusValue): boolean {
    return TRANSITIONS[this.value].includes(next);
  }

  is(value: OrderStatusValue): boolean {
    return this.value === value;
  }
}
