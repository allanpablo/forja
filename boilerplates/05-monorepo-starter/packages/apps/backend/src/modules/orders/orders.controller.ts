import { Controller, Get, Post, Body, Param, Patch, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto';
import { JwtGuard } from '../../common/guards/jwt.guard';
import type { OrderResponse, OrderListResponse } from '@monorepo/shared-types';

@Controller('orders')
@UseGuards(JwtGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  async create(
    @Body() dto: CreateOrderDto,
    @Request() req: any
  ): Promise<{ success: boolean; data: OrderResponse }> {
    const data = await this.ordersService.create(dto, req.user.id);
    return { success: true, data };
  }

  @Get()
  async findByUser(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Request() req: any
  ): Promise<{ success: boolean; data: OrderListResponse }> {
    const data = await this.ordersService.findByUserId(req.user.id, Number(page), Number(limit));
    return { success: true, data };
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<{ success: boolean; data: OrderResponse }> {
    const data = await this.ordersService.findById(id);
    return { success: true, data };
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto
  ): Promise<{ success: boolean; data: OrderResponse }> {
    const data = await this.ordersService.updateStatus(id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ success: boolean }> {
    // Soft delete or cancel logic here
    return { success: true };
  }
}
