import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger('GatewayService');
  private authService: AxiosInstance;
  private userService: AxiosInstance;
  private notificationService: AxiosInstance;

  constructor() {
    const baseConfig = {
      timeout: 5000,
      validateStatus: () => true,
    };

    this.authService = axios.create({
      baseURL: 'http://auth-service:3001',
      ...baseConfig,
    });

    this.userService = axios.create({
      baseURL: 'http://user-service:3002',
      ...baseConfig,
    });

    this.notificationService = axios.create({
      baseURL: 'http://notification-service:3003',
      ...baseConfig,
    });
  }

  async forwardRequest(
    path: string,
    method: string,
    data?: any,
    headers?: any,
  ): Promise<any> {
    try {
      let service: AxiosInstance;

      if (path.startsWith('/auth')) {
        service = this.authService;
        path = path.replace('/auth', '');
      } else if (path.startsWith('/users')) {
        service = this.userService;
      } else if (path.startsWith('/notifications')) {
        service = this.notificationService;
        path = path.replace('/notifications', '');
      } else {
        throw new HttpException('Route not found', HttpStatus.NOT_FOUND);
      }

      const config = {
        headers: {
          ...this.getForwardHeaders(headers),
        },
      };

      const response = await service.request({
        method: method.toLowerCase(),
        url: path,
        data,
        ...config,
      });

      if (response.status >= 500) {
        this.logger.error(`Service returned ${response.status}:`, response.data);
        throw new HttpException(
          response.data || 'Service error',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      return response.data;
    } catch (error: any) {
      this.logger.error('Gateway error:', error.message);

      if (error.response) {
        throw new HttpException(error.response.data, error.response.status);
      }

      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new HttpException(
          { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service is unavailable' } },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      throw new HttpException(
        { error: { code: 'GATEWAY_ERROR', message: 'Gateway error' } },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getForwardHeaders(headers: any): Record<string, string> {
    const forwardHeaders: Record<string, string> = {};

    if (headers['authorization']) {
      forwardHeaders['authorization'] = headers['authorization'];
    }

    if (headers['x-request-id']) {
      forwardHeaders['x-request-id'] = headers['x-request-id'];
    }

    if (headers['x-correlation-id']) {
      forwardHeaders['x-correlation-id'] = headers['x-correlation-id'];
    }

    return forwardHeaders;
  }
}
