import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  All,
  Req,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { Request } from 'express';
import { GatewayService } from './gateway.service';

@Controller()
export class GatewayController {
  private readonly logger = new Logger('GatewayController');

  constructor(private gatewayService: GatewayService) {}

  @All('*')
  async forward(@Req() req: Request) {
    const path = req.path;
    const method = req.method;
    const body = req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined;

    this.logger.log(`${method} ${path}`);

    return this.gatewayService.forwardRequest(path, method, body, req.headers);
  }

  @Get('gateway/health')
  async health() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      service: 'api-gateway',
      checks: {
        auth: { status: 'UP' },
        user: { status: 'UP' },
        notification: { status: 'UP' },
      },
    };
  }
}
