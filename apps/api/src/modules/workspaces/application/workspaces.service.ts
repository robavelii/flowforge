import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../persistence/prisma.service';
import { OutboxService } from '../../../common/outbox/outbox.service';
import { slugify } from '../../../common/utils/crypto.util';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    userId: string,
    input: { organizationId: string; name: string; slug?: string; description?: string },
  ) {
    const org = await this.prisma.organization.findFirst({
      where: { id: input.organizationId, deletedAt: null },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    if (org.ownerUserId !== userId) {
      throw new ForbiddenException('Only the organization owner can create workspaces');
    }

    const slug = slugify(input.slug ?? input.name);
    if (!slug) {
      throw new ConflictException('Invalid workspace slug');
    }

    const existing = await this.prisma.workspace.findFirst({
      where: { organizationId: org.id, slug, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Workspace slug already taken in this organization');
    }

    return this.prisma.$transaction(async (tx) => {
      const ownerRole = await tx.role.findFirst({
        where: { slug: 'owner', isSystem: true, deletedAt: null },
      });

      const workspace = await tx.workspace.create({
        data: {
          organizationId: org.id,
          name: input.name.trim(),
          slug,
          description: input.description ?? null,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId,
          role: 'owner',
          roleId: ownerRole?.id,
        },
      });

      await this.outbox.append(
        {
          workspaceId: workspace.id,
          aggregateType: 'Workspace',
          aggregateId: workspace.id,
          eventType: 'WorkspaceCreated',
          payload: {
            workspaceId: workspace.id,
            organizationId: org.id,
            name: workspace.name,
            slug: workspace.slug,
            createdBy: userId,
          },
        },
        tx,
      );

      await this.outbox.append(
        {
          workspaceId: workspace.id,
          aggregateType: 'WorkspaceMember',
          aggregateId: workspace.id,
          eventType: 'MemberAdded',
          payload: {
            workspaceId: workspace.id,
            userId,
            role: 'owner',
          },
        },
        tx,
      );

      return workspace;
    });
  }

  async listForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId, status: 'active' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(userId: string, workspaceId: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    await this.assertMember(userId, workspaceId);
    return workspace;
  }

  async update(
    userId: string,
    workspaceId: string,
    input: { name?: string; description?: string | null },
  ) {
    await this.assertMember(userId, workspaceId, ['owner', 'admin']);
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: input.name?.trim(),
        description: input.description === undefined ? undefined : input.description,
      },
    });
  }

  async softDelete(userId: string, workspaceId: string): Promise<void> {
    await this.assertMember(userId, workspaceId, ['owner']);
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { deletedAt: new Date() },
    });
  }

  private async assertMember(
    userId: string,
    workspaceId: string,
    roles?: string[],
  ): Promise<void> {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId, status: 'active' },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this workspace');
    }
    if (roles && !roles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient workspace role');
    }
  }
}
