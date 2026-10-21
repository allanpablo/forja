import { ForbiddenException, Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest, Role } from './principal.js';

const ROLES_KEY = 'roles';
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Use depois do JwtAuthGuard. Sem @RequireRoles na rota, qualquer usuário autenticado passa. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const roles = context.switchToHttp().getRequest<AuthenticatedRequest>().principal?.roles ?? [];
    if (!required.some((role) => roles.includes(role))) throw new ForbiddenException('Permissão insuficiente');
    return true;
  }
}
