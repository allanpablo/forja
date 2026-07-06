import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RequestId, createSuccessResponse, generateRequestId } from 'shared';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger('AuthController');

  constructor(private authService: AuthService) {}

  @Post('register')
  async register(
    @Body() body: { email: string; password: string; name?: string },
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();

    if (!body.email || !body.password) {
      throw new BadRequestException('Email and password are required');
    }

    const tokens = await this.authService.register(body.email, body.password, body.name);

    return createSuccessResponse(
      {
        userId: 'user-id-from-token',
        email: body.email,
        tokens,
      },
      requestId,
      Date.now() - startTime,
    );
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: { email: string; password: string },
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();

    if (!body.email || !body.password) {
      throw new BadRequestException('Email and password are required');
    }

    const tokens = await this.authService.login(body.email, body.password);

    return createSuccessResponse(
      {
        userId: 'user-id-from-token',
        tokens,
      },
      requestId,
      Date.now() - startTime,
    );
  }

  @Post('refresh')
  @UseGuards(AuthGuard('jwt'))
  async refresh(
    @Body() body: { refreshToken: string },
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();

    if (!body.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const tokens = await this.authService.refreshToken(body.refreshToken);

    return createSuccessResponse(tokens, requestId, Date.now() - startTime);
  }

  @Get('verify')
  @UseGuards(AuthGuard('jwt'))
  async verify(@RequestId() requestId: string = generateRequestId()) {
    const startTime = Date.now();

    return createSuccessResponse(
      {
        valid: true,
        message: 'Token is valid',
      },
      requestId,
      Date.now() - startTime,
    );
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  async logout(
    @Body() body: { refreshToken?: string },
    @RequestId() requestId: string = generateRequestId(),
  ) {
    const startTime = Date.now();

    if (body.refreshToken) {
      await this.authService.logout(body.refreshToken);
    }

    return createSuccessResponse(
      { message: 'Successfully logged out' },
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
