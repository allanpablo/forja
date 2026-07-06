import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { Category } from './entities/category.entity';
import { CreateProductDTO } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async createProduct(createProductDTO: CreateProductDTO): Promise<Product> {
    const category = await this.categoryRepository.findOne({
      where: { id: createProductDTO.categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const product = this.productRepository.create({
      ...createProductDTO,
      category,
    });

    return this.productRepository.save(product);
  }

  async getProducts(
    page: number = 1,
    limit: number = 20,
    category?: string,
    search?: string,
    minPrice?: number,
    maxPrice?: number,
  ): Promise<{ data: Product[]; total: number; pages: number }> {
    const query = this.productRepository.createQueryBuilder('product');

    if (category) {
      query.andWhere('product.category.slug = :slug', { slug: category });
    }

    if (search) {
      query.andWhere(
        '(product.name ILIKE :search OR product.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (minPrice !== undefined) {
      query.andWhere('product.price >= :minPrice', { minPrice });
    }

    if (maxPrice !== undefined) {
      query.andWhere('product.price <= :maxPrice', { maxPrice });
    }

    query.andWhere('product.status = :status', { status: 'active' });

    const skip = (page - 1) * limit;
    const [data, total] = await query
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  async getProductById(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category', 'reviews'],
    });

    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    return product;
  }

  async updateProduct(
    id: string,
    updateData: Partial<CreateProductDTO>,
  ): Promise<Product> {
    const product = await this.getProductById(id);
    Object.assign(product, updateData);
    return this.productRepository.save(product);
  }

  async deleteProduct(id: string): Promise<void> {
    const product = await this.getProductById(id);
    await this.productRepository.remove(product);
  }

  async getCategories(): Promise<Category[]> {
    return this.categoryRepository.find({
      where: { parentId: null },
      relations: ['subcategories', 'products'],
      order: { displayOrder: 'ASC' },
    });
  }
}
