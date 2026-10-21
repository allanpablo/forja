import { Module } from '@nestjs/common';
import { AuthService } from './application/auth.service.js';
import { IDENTITY_REPOSITORY } from './domain/model.js';
import { TypeOrmIdentityRepository } from './adapters/persistence/typeorm-identity.repository.js';
import { AuthController, IdentityController } from './adapters/http/identity.controller.js';

@Module({
  controllers: [AuthController, IdentityController],
  providers: [AuthService, { provide: IDENTITY_REPOSITORY, useClass: TypeOrmIdentityRepository }],
  exports: [IDENTITY_REPOSITORY],
})
export class IdentityModule {}
