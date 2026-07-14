import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MemberStatus } from '@prisma/client';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { SKIP_TENANT_KEY } from './skip-tenant.decorator';
import { PrismaService } from '../../persistence/prisma.service';
import type { TenantContextData } from './tenant-context';

type AuthenticatedRequest = Request & {
  user?: { sub: string; sid?: string };
  apiKey?: { id: string; scopes: string[]; workspaceId: string };
  tenant?: TenantContextData;
};

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipTenant) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const workspaceHeader = request.headers['x-workspace-id'];
    const workspaceId = Array.isArray(workspaceHeader) ? workspaceHeader[0] : workspaceHeader;
    if (!workspaceId) {
      throw new ForbiddenException('X-Workspace-Id header is required');
    }

    if (request.apiKey) {
      if (request.apiKey.workspaceId !== workspaceId) {
        throw new ForbiddenException('API key is not valid for this workspace');
      }
      const workspace = await this.prisma.workspace.findFirst({
        where: { id: workspaceId, deletedAt: null },
      });
      if (!workspace) {
        throw new ForbiddenException('Workspace not found');
      }
      request.tenant = {
        workspaceId,
        organizationId: workspace.organizationId,
        userId,
        memberRole: 'api_key',
      };
      return true;
    }

    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        status: MemberStatus.active,
        workspace: { deletedAt: null },
      },
      include: {
        workspace: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('Not a member of this workspace');
    }

    request.tenant = {
      workspaceId: membership.workspaceId,
      organizationId: membership.workspace.organizationId,
      userId,
      memberRole: membership.role,
    };

    return true;
  }
}
