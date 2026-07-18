import { Order } from './order.entity';

/**
 * OrderRepository — a **PORTA** (Clean Architecture / Hexagonal). É uma `interface` no domínio: o
 * domínio declara o que precisa de persistência, sem saber *como*. O adapter (TypeORM, in-memory,
 * outro) a implementa na camada de infraestrutura.
 *
 * `ORDER_REPOSITORY` é o token de injeção do NestJS — porque interface não existe em runtime, o Nest
 * injeta por token. O use-case pede o token; o módulo faz o bind token→adapter. É assim que a
 * dependência aponta para DENTRO: application → domain, e a infra implementa a porta do domínio.
 */
export const ORDER_REPOSITORY = Symbol('OrderRepository');

export interface OrderRepository {
  save(order: Order): Promise<void>;
  byId(id: string): Promise<Order | null>;
}
