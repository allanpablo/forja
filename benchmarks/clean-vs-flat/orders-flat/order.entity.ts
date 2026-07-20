import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Order (flat) — o "modelo é a tabela". Sem comportamento: os campos são dados, e as regras vivem
 * no service. É o estilo NestJS ingênuo (o mesmo de `02-saas`), aqui para comparar token a token
 * com a fatia `orders/` em camadas.
 */
export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'PAID' | 'SHIPPED' | 'CANCELLED';

export interface OrderLine {
  productId: string;
  unitPriceCents: number;
  quantity: number;
}

@Entity('orders')
export class Order {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @Column('jsonb')
  lines: OrderLine[];

  @Column({ default: 'DRAFT' })
  status: OrderStatus;

  @Column({ type: 'int', default: 0 })
  totalCents: number;
}
