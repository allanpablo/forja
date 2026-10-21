import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import type { Role } from './principal.js';

const ctx = (roles: Role[] | undefined): ExecutionContext => ({
  getHandler: () => () => undefined,
  getClass: () => class {},
  switchToHttp: () => ({ getRequest: () => ({ principal: roles ? { userId: 'u', tenantId: 't', roles } : undefined }) }),
}) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const guardFor = (required: Role[] | undefined) => new RolesGuard({ getAllAndOverride: () => required } as unknown as Reflector);

  it('rota sem papéis exigidos libera qualquer autenticado', () => {
    expect(guardFor(undefined).canActivate(ctx(['member']))).toBe(true);
  });

  it('libera quem tem um dos papéis e barra quem não tem', () => {
    expect(guardFor(['owner', 'admin']).canActivate(ctx(['admin']))).toBe(true);
    expect(() => guardFor(['owner']).canActivate(ctx(['member']))).toThrow(ForbiddenException);
  });
});
