import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { Category } from './category.entity';
import { Review } from '../reviews/entities/review.entity';

@Entity('products')
@Index(['categoryId'])
@Index(['status'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('varchar', { length: 50, unique: true })
  sku: string;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column('int', { default: 0 })
  discount_percent: number;

  @Column('uuid')
  categoryId: string;

  @ManyToOne(() => Category, (category) => category.products)
  category: Category;

  @Column('varchar', { nullable: true })
  imageUrl: string;

  @Column('float', { default: 0 })
  rating: number;

  @Column('int', { default: 0 })
  reviewCount: number;

  @Column('enum', { enum: ['active', 'inactive', 'discontinued'], default: 'active' })
  status: string;

  @OneToMany(() => Review, (review) => review.product)
  reviews: Review[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get finalPrice(): number {
    return this.price * (1 - this.discount_percent / 100);
  }
}
