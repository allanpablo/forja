import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Product — CRUD puro, SEM regra de negócio. Aqui a orm-entity É o modelo: não há invariante para
 * proteger, então separar domínio/persistência seria custo sem retorno. Uma classe, decorada.
 *
 * Este é o **caminho enxuto** (AC-4). Compare com `modules/orders/`: lá, quatro camadas porque há
 * regra que se paga; aqui, uma, porque não há. Ver `WHEN-CLEAN-WHEN-LEAN.md`.
 */
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column('int')
  priceCents!: number;
}
