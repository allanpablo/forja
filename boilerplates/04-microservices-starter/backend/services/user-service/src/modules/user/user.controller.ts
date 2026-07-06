import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { RequestId, generateRequestId, createSuccessResponse } from 'shared';

@Controller('users')
export class UserController {
  private readonly logger = new Logger('UserController');

  constructor(private userService: UserService) {}

  @Get(':userId')
  async getUserProfile(
    @Param('userId') userId: string,
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();
    const profile = await this.userService.getUserProfile(userId);
    return createSuccessResponse(profile, requestId, Date.now() - startTime);
  }

  @Post()
  async createProfile(
    @Body() body: { email: string; fullName: string; avatar?: string },
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();

    if (!body.email || !body.fullName) {
      throw new BadRequestException('Email and fullName are required');
    }

    const profile = await this.userService.createUserProfile(body.email, body.fullName, body.avatar);
    return createSuccessResponse(profile, requestId, Date.now() - startTime);
  }

  @Patch(':userId')
  async updateProfile(
    @Param('userId') userId: string,
    @Body() body: { fullName?: string; avatar?: string; bio?: string },
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();
    const profile = await this.userService.updateUserProfile(userId, body);
    return createSuccessResponse(profile, requestId, Date.now() - startTime);
  }

  @Patch(':userId/settings')
  async updateSettings(
    @Param('userId') userId: string,
    @Body() body: any,
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();
    const settings = await this.userService.updateUserSettings(userId, body);
    return createSuccessResponse(settings, requestId, Date.now() - startTime);
  }

  @Post(':userId/verify-email')
  async verifyEmail(
    @Param('userId') userId: string,
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();
    const profile = await this.userService.verifyEmail(userId);
    return createSuccessResponse(profile, requestId, Date.now() - startTime);
  }

  @Delete(':userId')
  async deleteUser(
    @Param('userId') userId: string,
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();
    await this.userService.deleteUser(userId);
    return createSuccessResponse({ message: 'User deleted' }, requestId, Date.now() - startTime);
  }

  @Get()
  async listUsers(
    @Query('limit') limit: string = '10',
    @Query('offset') offset: string = '0',
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();
    const { users, total } = await this.userService.listUsers(parseInt(limit), parseInt(offset));

    return createSuccessResponse(
      {
        data: users,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total,
        },
      },
      requestId,
      Date.now() - startTime,
    );
  }

  @Get('health')
  async health() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      checks: {
        service: { status: 'UP' },
      },
    };
  }
}
