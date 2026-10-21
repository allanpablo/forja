import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, loadConfig } from './config.js';
import { TokenService } from './auth/token.service.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }, TokenService, JwtAuthGuard, RolesGuard],
  exports: [APP_CONFIG, TokenService, JwtAuthGuard, RolesGuard],
})
export class PlatformModule {}
