import { Controller, Get, Post, Body, Param, Put, Delete, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { JwtGuard } from '../../common/guards/jwt.guard';
import type { ProductResponse, ProductListResponse } from '@monorepo/shared-types';

@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20
  ): Promise<{ success: boolean; data: ProductListResponse }> {
    const data = await this.productsService.findAll(Number(page), Number(limit));
    return { success: true, data };
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<{ success: boolean; data: ProductResponse }> {
    const data = await this.productsService.findById(id);
    return { success: true, data };
  }

  @Post()
  @UseGuards(JwtGuard)
  async create(@Body() dto: CreateProductDto): Promise<{ success: boolean; data: ProductResponse }> {
    const data = await this.productsService.create(dto);
    return { success: true, data };
  }

  @Put(':id')
  @UseGuards(JwtGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto
  ): Promise<{ success: boolean; data: ProductResponse }> {
    const data = await this.productsService.update(id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @UseGuards(JwtGuard)
  async remove(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.productsService.remove(id);
    return { success: true };
  }
}
