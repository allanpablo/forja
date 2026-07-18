import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * OrderOrmEntity — a forma de PERSISTÊNCIA, decorada com TypeORM. Vive só na infraestrutura.
 *
 * Repare: **não é** o `Order` do domínio. O agregado de domínio é TypeScript puro, sem `@Entity`. O
 * mapper (no repositório) traduz entre os dois. É essa separação que mantém o ORM fora do domínio —
 * trocar o TypeORM por outra coisa mexe só aqui.
 */
@Entity('orders')
export class OrderOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  customerId!: string;

  @Column()
  status!: string;

  /** Linhas serializadas — detalhe de persistência, não modelagem de domínio. */
  @Column('jsonb')
  lines!: Array<{ productId: string; unitPriceCents: number; quantity: number }>;
}
