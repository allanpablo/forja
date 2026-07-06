import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, LoginUserDto } from './dto';
import { JwtGuard } from '../../common/guards/jwt.guard';
import type { UserResponse, LoginResponse } from '@monorepo/shared-types';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('register')
  async register(@Body() dto: CreateUserDto): Promise<{ success: boolean; data: UserResponse }> {
    const user = await this.usersService.register(dto);
    return { success: true, data: user };
  }

  @Post('login')
  async login(@Body() dto: LoginUserDto): Promise<{ success: boolean; data: LoginResponse }> {
    const result = await this.usersService.login(dto);
    return { success: true, data: result };
  }

  @Get(':id')
  @UseGuards(JwtGuard)
  async getById(@Param('id') id: string): Promise<{ success: boolean; data: UserResponse }> {
    const user = await this.usersService.getById(id);
    return { success: true, data: user };
  }
}
