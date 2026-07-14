import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantContextData } from './tenant-context';

export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContextData => {
    const request = ctx.switchToHttp().getRequest<{ tenant?: TenantContextData }>();
    if (!request.tenant) {
      throw new Error('Tenant context missing on request');
    }
    return request.tenant;
  },
);
