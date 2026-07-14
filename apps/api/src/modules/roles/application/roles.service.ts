import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../persistence/prisma.service';
import { OutboxService } from '../../../common/outbox/outbox.service';
import { AuditService } from '../../audit/application/audit.service';
import { PermissionCacheService } from '../../authorization/infrastructure/permission-cache.service';
import { ALL_PERMISSIONS } from '../../authorization/domain/permission-catalog';
import { slugify } from '../../../common/utils/crypto.util';

const ASSIGNABLE_PERMISSION_KEYS = new Set(
  ALL_PERMISSIONS.filter((p) => !p.key.startsWith('system:')).map((p) => p.key),
);

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCacheService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async listSystemAndWorkspaceRoles(workspaceId: string) {
    return this.prisma.role.findMany({
      where: {
        deletedAt: null,
        OR: [{ isSystem: true, workspaceId: null }, { workspaceId }],
      },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async createCustomRole(
    workspaceId: string,
    input: { name: string; slug?: string; permissionKeys: string[] },
    actorUserId: string,
  ) {
    const slug = input.slug?.trim() || slugify(input.name);
    if (!slug) {
      throw new BadRequestException('Role slug is required');
    }

    const permissionIds = await this.resolvePermissionIds(input.permissionKeys);

    const existing = await this.prisma.role.findFirst({
      where: { workspaceId, slug, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`Role slug "${slug}" already exists in this workspace`);
    }

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          workspaceId,
          name: input.name.trim(),
          slug,
          isSystem: false,
          rolePermissions: {
            create: permissionIds.map((permissionId) => ({ permissionId })),
          },
        },
        include: {
          rolePermissions: { include: { permission: true } },
        },
      });

      await this.outbox.append(
        {
          workspaceId,
          aggregateType: 'Role',
          aggregateId: created.id,
          eventType: 'RoleCreated',
          payload: {
            roleId: created.id,
            workspaceId,
            name: created.name,
            slug: created.slug,
            permissionKeys: input.permissionKeys,
          },
        },
        tx,
      );

      return created;
    });

    await this.permissionCache.invalidate(workspaceId);
    await this.audit.write({
      workspaceId,
      actorUserId,
      action: 'role.created',
      resourceType: 'Role',
      resourceId: role.id,
      after: {
        name: role.name,
        slug: role.slug,
        permissionKeys: input.permissionKeys,
      },
    });

    return role;
  }

  async updateCustomRole(
    workspaceId: string,
    roleId: string,
    input: { permissionKeys: string[]; name?: string },
    actorUserId: string,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, workspaceId, deletedAt: null },
      include: {
        rolePermissions: { include: { permission: true } },
      },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be modified');
    }

    const permissionIds = await this.resolvePermissionIds(input.permissionKeys);
    const beforeKeys = role.rolePermissions.map((rp) => rp.permission.key);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });

      const next = await tx.role.update({
        where: { id: role.id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        },
        include: {
          rolePermissions: { include: { permission: true } },
        },
      });

      await this.outbox.append(
        {
          workspaceId,
          aggregateType: 'Role',
          aggregateId: role.id,
          eventType: 'RoleUpdated',
          payload: {
            roleId: role.id,
            workspaceId,
            permissionKeys: input.permissionKeys,
            name: next.name,
          },
        },
        tx,
      );

      return next;
    });

    await this.permissionCache.invalidate(workspaceId);
    await this.audit.write({
      workspaceId,
      actorUserId,
      action: 'role.updated',
      resourceType: 'Role',
      resourceId: role.id,
      before: { name: role.name, permissionKeys: beforeKeys },
      after: {
        name: updated.name,
        permissionKeys: input.permissionKeys,
      },
    });

    return updated;
  }

  async deleteCustomRole(workspaceId: string, roleId: string, actorUserId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, workspaceId, deletedAt: null },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be deleted');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: role.id },
        data: { deletedAt: new Date() },
      });

      await this.outbox.append(
        {
          workspaceId,
          aggregateType: 'Role',
          aggregateId: role.id,
          eventType: 'RoleDeleted',
          payload: {
            roleId: role.id,
            workspaceId,
            slug: role.slug,
          },
        },
        tx,
      );
    });

    await this.permissionCache.invalidate(workspaceId);
    await this.audit.write({
      workspaceId,
      actorUserId,
      action: 'role.deleted',
      resourceType: 'Role',
      resourceId: role.id,
      before: { name: role.name, slug: role.slug },
    });
  }

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: { key: 'asc' },
    });
  }

  private async resolvePermissionIds(permissionKeys: string[]): Promise<string[]> {
    const unique = [...new Set(permissionKeys)];
    if (unique.length === 0) {
      throw new BadRequestException('At least one permission key is required');
    }

    const unknown = unique.filter((key) => !ASSIGNABLE_PERMISSION_KEYS.has(key));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown or non-assignable permissions: ${unknown.join(', ')}`);
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: unique } },
      select: { id: true, key: true },
    });

    if (permissions.length !== unique.length) {
      const found = new Set(permissions.map((p) => p.key));
      const missing = unique.filter((k) => !found.has(k));
      throw new BadRequestException(`Permissions not found in catalog: ${missing.join(', ')}`);
    }

    return permissions.map((p) => p.id);
  }
}
