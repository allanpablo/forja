import { IsString, IsNumber, IsUUID, IsOptional, MinLength, Min, Max } from 'class-validator';

export class CreateProductDTO {
  @IsString()
  @MinLength(3)
  name: string;

  @IsNumber()
  @Min(0.01)
  price: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  sku: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  discount_percent?: number = 0;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  status?: string = 'active';
}
