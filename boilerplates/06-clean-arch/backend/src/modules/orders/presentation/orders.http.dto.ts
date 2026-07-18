import { IsArray, IsInt, IsPositive, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTOs de HTTP — a forma do que chega pela borda. Validados com class-validator. São de
 * PRESENTAÇÃO: o controller os traduz para o input do use-case. O domínio nunca vê estes tipos.
 */

class OrderItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @IsPositive()
  unitPriceCents!: number;

  @IsInt()
  @IsPositive()
  quantity!: number;
}

export class PlaceOrderHttpDto {
  @IsString()
  customerId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
