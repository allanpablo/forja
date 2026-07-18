import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsInt, IsPositive, IsString } from 'class-validator';
import { Product } from './product.entity';

class CreateProductDto {
  @IsString()
  name!: string;

  @IsInt()
  @IsPositive()
  priceCents!: number;
}

/**
 * CRUD enxuto: o controller fala DIRETO com o repositório do TypeORM. Sem use-case, sem porta, sem
 * mapper. Para dados sem invariante, essas camadas seriam só arquivos a mais para o dev e para o
 * agente lerem — o oposto de economia de token.
 *
 * A regra de quando promover isto para o padrão de `orders/` está em `WHEN-CLEAN-WHEN-LEAN.md`.
 */
@Controller('products')
export class ProductsController {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
  ) {}

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.repo.save(this.repo.create(dto));
  }

  @Get()
  list() {
    return this.repo.find();
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.repo.findOne({ where: { id } });
  }
}
