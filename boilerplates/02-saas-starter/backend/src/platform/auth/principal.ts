import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export const ROLES = ['owner', 'admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

/** Quem está chamando: vem só do token verificado, nunca do corpo da requisição. */
export interface Principal {
  readonly userId: string;
  readonly tenantId: string;
  readonly roles: readonly Role[];
}

export interface AuthenticatedRequest {
  principal?: Principal;
  headers: Record<string, string | string[] | undefined>;
}

export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const principal = ctx.switchToHttp().getRequest<AuthenticatedRequest>().principal;
  if (!principal) throw new Error('CurrentPrincipal usado em rota sem JwtAuthGuard');
  return principal;
});
