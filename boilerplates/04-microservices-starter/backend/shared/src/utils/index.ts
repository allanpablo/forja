import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function startService(
  AppModule: any,
  serviceName: string,
  port: number,
): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger(serviceName);

  app.enableCors();
  
  await app.listen(port, '0.0.0.0');
  logger.log(`✅ ${serviceName} is running on port ${port}`);
}

export function createErrorResponse(
  code: string,
  message: string,
  statusCode: number,
  requestId: string,
  details?: any,
) {
  return {
    error: {
      code,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      requestId,
      details,
    },
  };
}

export function createSuccessResponse<T>(
  data: T,
  requestId: string,
  processingTime: number,
) {
  return {
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      processingTime,
    },
  };
}
