import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const TenantId = createParamDecorator((_, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.tenantId;
});
