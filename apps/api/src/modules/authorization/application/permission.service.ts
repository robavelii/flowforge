import { Injectable } from '@nestjs/common';
import { AbacEffect } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma.service';
import { PermissionCacheService } from '../infrastructure/permission-cache.service';
import type { AbacCondition, AbacResourceContext } from '../domain/abac.types';

@Injectable()
export class PermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PermissionCacheService,
  ) {}

  async getUserPermissions(workspaceId: string, userId: string): Promise<Set<string>> {
    const cached = await this.cache.get(workspaceId, userId);
    if (cached) {
      return new Set(cached);
    }

    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId, status: 'active' },
      include: {
        primaryRole: {
          include: { rolePermissions: { include: { permission: true } } },
        },
        memberRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (!member) {
      return new Set();
    }

    const permissions = new Set<string>();

    const addRolePerms = (
      role:
        | {
            rolePermissions: Array<{ permission: { key: string } }>;
          }
        | null
        | undefined,
    ): void => {
      role?.rolePermissions.forEach((rp) => permissions.add(rp.permission.key));
    };

    addRolePerms(member.primaryRole);

    if (member.role && !member.primaryRole) {
      const primaryRole = await this.prisma.role.findFirst({
        where: {
          slug: member.role,
          deletedAt: null,
          OR: [{ workspaceId: null, isSystem: true }, { workspaceId }],
        },
        include: { rolePermissions: { include: { permission: true } } },
      });
      addRolePerms(primaryRole);
    }

    for (const mr of member.memberRoles) {
      addRolePerms(mr.role);
    }

    const list = [...permissions];
    await this.cache.set(workspaceId, userId, list);
    return permissions;
  }

  async getApiKeyPermissions(
    workspaceId: string,
    apiKeyId: string,
    scopes: string[],
  ): Promise<Set<string>> {
    const cached = await this.cache.get(workspaceId, `apikey:${apiKeyId}`);
    if (cached) {
      return new Set(cached);
    }
    const expanded = new Set(scopes);
    await this.cache.set(workspaceId, `apikey:${apiKeyId}`, [...expanded]);
    return expanded;
  }

  hasPermission(granted: Set<string>, required: string): boolean {
    if (granted.has('*:*') || granted.has(required)) {
      return true;
    }
    const [resource] = required.split(':');
    if (resource && granted.has(`${resource}:*`)) {
      return true;
    }
    return false;
  }

  async evaluateAbac(params: {
    workspaceId: string;
    actorUserId: string;
    permission: string;
    resource?: AbacResourceContext;
  }): Promise<'allow' | 'deny' | 'neutral'> {
    const policies = await this.prisma.abacPolicy.findMany({
      where: {
        workspaceId: params.workspaceId,
        enabled: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    let decision: 'allow' | 'deny' | 'neutral' = 'neutral';

    for (const policy of policies) {
      const perms = policy.permissions as string[];
      if (!perms.includes(params.permission) && !perms.includes('*')) {
        continue;
      }
      const conditions = policy.conditions as AbacCondition[];
      const matched = conditions.every((c) =>
        this.matchCondition(c, params.actorUserId, params.resource),
      );
      if (!matched) {
        continue;
      }
      if (policy.effect === AbacEffect.deny) {
        return 'deny';
      }
      decision = 'allow';
    }

    if (
      decision === 'neutral' &&
      params.permission === 'workflow:delete' &&
      params.resource?.createdBy
    ) {
      return params.resource.createdBy === params.actorUserId ? 'allow' : 'deny';
    }

    return decision;
  }

  private matchCondition(
    condition: AbacCondition,
    actorUserId: string,
    resource?: AbacResourceContext,
  ): boolean {
    let left: unknown;
    switch (condition.attribute) {
      case 'resource.ownerId':
      case 'resource.createdBy':
        left = resource?.createdBy ?? resource?.ownerId;
        break;
      case 'actor.id':
        left = actorUserId;
        break;
      default:
        left = resource?.attributes?.[condition.attribute];
    }

    switch (condition.operator) {
      case 'eq':
        return left === condition.value;
      case 'neq':
        return left !== condition.value;
      case 'in':
        return Array.isArray(condition.value) && (condition.value as unknown[]).includes(left);
      case 'contains':
        return Array.isArray(left) && (left as unknown[]).includes(condition.value);
      default:
        return false;
    }
  }

  async invalidateWorkspace(workspaceId: string): Promise<void> {
    await this.cache.invalidate(workspaceId);
  }
}
