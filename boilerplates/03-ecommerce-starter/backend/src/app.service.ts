import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): object {
    return {
      status: 'up',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }
}
