import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto, UpdateProductDto } from './dto';
import type { ProductResponse, ProductListResponse } from '@monorepo/shared-types';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>
  ) {}

  async create(dto: CreateProductDto): Promise<ProductResponse> {
    const existing = await this.productsRepository.findOne({ where: { sku: dto.sku } });
    if (existing) {
      throw new ConflictException('SKU already exists');
    }

    const product = this.productsRepository.create(dto);
    await this.productsRepository.save(product);
    return this.productToResponse(product);
  }

  async findAll(page = 1, limit = 20): Promise<ProductListResponse> {
    const [products, total] = await this.productsRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      products: products.map(p => this.productToResponse(p)),
      total,
      page,
      limit,
    };
  }

  async findById(id: string): Promise<ProductResponse> {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.productToResponse(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    Object.assign(product, dto);
    await this.productsRepository.save(product);
    return this.productToResponse(product);
  }

  async remove(id: string): Promise<void> {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    await this.productsRepository.remove(product);
  }

  private productToResponse(product: Product): ProductResponse {
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      price: Number(product.price),
      stockQuantity: product.stock_quantity,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
    };
  }
}
