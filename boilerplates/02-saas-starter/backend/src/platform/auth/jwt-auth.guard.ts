import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './principal.js';
import { TokenService } from './token.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    if (!value?.startsWith('Bearer ')) throw new UnauthorizedException('Token ausente');
    request.principal = await this.tokens.verifyAccess(value.slice('Bearer '.length));
    return true;
  }
}
