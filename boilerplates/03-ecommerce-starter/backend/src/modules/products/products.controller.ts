import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDTO } from './dto/create-product.dto';
import { Product } from './entities/product.entity';
import { Category } from './entities/category.entity';

@ApiTags('Products')
@Controller('api/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products with filtering and pagination' })
  async listProducts(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
  ) {
    return this.productsService.getProducts(
      page,
      Math.min(limit, 100),
      category,
      search,
      minPrice,
      maxPrice,
    );
  }

  @Get('categories')
  @ApiOperation({ summary: 'List all categories' })
  async getCategories(): Promise<Category[]> {
    return this.productsService.getCategories();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  async getProduct(@Param('id') id: string): Promise<Product> {
    return this.productsService.getProductById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create product (admin only)' })
  async createProduct(@Body() createProductDTO: CreateProductDTO): Promise<Product> {
    return this.productsService.createProduct(createProductDTO);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update product (admin only)' })
  async updateProduct(
    @Param('id') id: string,
    @Body() updateData: Partial<CreateProductDTO>,
  ): Promise<Product> {
    return this.productsService.updateProduct(id, updateData);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete product (admin only)' })
  async deleteProduct(@Param('id') id: string): Promise<void> {
    return this.productsService.deleteProduct(id);
  }
}
