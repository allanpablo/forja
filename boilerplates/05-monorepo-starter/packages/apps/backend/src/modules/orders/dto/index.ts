import { IsArray, IsString, IsNumber, Min } from 'class-validator';

export class OrderItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @IsArray()
  items: OrderItemDto[];

  @IsString()
  shippingAddress: string;
}

export class UpdateOrderStatusDto {
  @IsString()
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
}
