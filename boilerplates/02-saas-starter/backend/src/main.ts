import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { APP_CONFIG, type AppConfig } from './platform/config.js';

async function bootstrap(): Promise<void> {
  // .env é opcional: em produção as variáveis vêm do ambiente.
  if (existsSync('.env')) process.loadEnvFile('.env');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // whitelist + forbidNonWhitelisted: campos fora do DTO são rejeitados (nada de atribuição em massa).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(APP_CONFIG);
  if (!config.production) {
    const doc = new DocumentBuilder().setTitle('SaaS Starter API').setVersion('0.1.0').addBearerAuth().build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  }
  await app.listen(config.port);
}

await bootstrap();
