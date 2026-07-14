import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/auth/public.decorator';
import { SKIP_TENANT_KEY } from '../../../common/tenant/skip-tenant.decorator';
import { PERMISSIONS_KEY } from '../../../common/auth/require-permission.decorator';
import {
  ABAC_RESOURCE_KEY,
  type AbacResourceResolver,
} from '../../../common/auth/abac-resource.decorator';
import { PermissionService } from './permission.service';
import { PrismaService } from '../../../persistence/prisma.service';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import type { AuthUser } from '../../../common/auth/current-user.decorator';
import type { AbacResourceContext } from '../domain/abac.types';

type AuthedRequest = {
  user?: AuthUser;
  tenant?: TenantContextData;
  apiKey?: { id: string; scopes: string[]; workspaceId: string };
  params?: Record<string, string>;
};

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipTenant) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const tenant = request.tenant;
    if (!tenant) {
      throw new ForbiddenException('Tenant context required for permission check');
    }

    let granted: Set<string>;
    if (request.apiKey) {
      granted = await this.permissions.getApiKeyPermissions(
        tenant.workspaceId,
        request.apiKey.id,
        request.apiKey.scopes,
      );
    } else if (request.user) {
      granted = await this.permissions.getUserPermissions(tenant.workspaceId, request.user.sub);
    } else {
      throw new ForbiddenException('Authentication required');
    }

    const resolver = this.reflector.getAllAndOverride<AbacResourceResolver | undefined>(
      ABAC_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    let resource: AbacResourceContext | undefined = resolver
      ? await resolver(request)
      : undefined;

    if (!resource && required.includes('workflow:delete')) {
      const workflowId = request.params?.['id'];
      if (workflowId) {
        const wf = await this.prisma.workflow.findFirst({
          where: { id: workflowId, workspaceId: tenant.workspaceId, deletedAt: null },
          select: { createdByUserId: true },
        });
        if (wf) {
          resource = {
            resourceType: 'Workflow',
            resourceId: workflowId,
            createdBy: wf.createdByUserId,
          };
        }
      }
    }

    for (const perm of required) {
      const rbacOk = this.permissions.hasPermission(granted, perm);

      if (request.apiKey) {
        if (!rbacOk) {
          throw new ForbiddenException(`Missing permission: ${perm}`);
        }
        continue;
      }

      const abac = await this.permissions.evaluateAbac({
        workspaceId: tenant.workspaceId,
        actorUserId: request.user!.sub,
        permission: perm,
        resource,
      });

      if (abac === 'deny') {
        throw new ForbiddenException(`Permission denied: ${perm}`);
      }
      if (rbacOk || abac === 'allow') {
        continue;
      }
      throw new ForbiddenException(`Missing permission: ${perm}`);
    }

    return true;
  }
}
