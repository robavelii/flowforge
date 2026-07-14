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
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async create(userId: string, input: { name: string; slug?: string }) {
    const slug = slugify(input.slug ?? input.name);
    if (!slug) {
      throw new ConflictException('Invalid organization slug');
    }

    const existing = await this.prisma.organization.findFirst({
      where: { slug, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Organization slug already taken');
    }

    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.name.trim(),
          slug,
          ownerUserId: userId,
        },
      });

      await this.outbox.append(
        {
          aggregateType: 'Organization',
          aggregateId: org.id,
          eventType: 'OrganizationCreated',
          payload: { organizationId: org.id, name: org.name, slug: org.slug, ownerUserId: userId },
        },
        tx,
      );

      return org;
    });
  }

  async listForUser(userId: string) {
    return this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        OR: [
          { ownerUserId: userId },
          {
            workspaces: {
              some: {
                deletedAt: null,
                members: { some: { userId, status: 'active' } },
              },
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(userId: string, orgId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, deletedAt: null },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    await this.assertCanAccess(userId, org);
    return org;
  }

  async update(userId: string, orgId: string, input: { name?: string }) {
    const org = await this.getById(userId, orgId);
    if (org.ownerUserId !== userId) {
      throw new ForbiddenException('Only the organization owner can update it');
    }
    return this.prisma.organization.update({
      where: { id: org.id },
      data: {
        name: input.name?.trim(),
      },
    });
  }

  async softDelete(userId: string, orgId: string): Promise<void> {
    const org = await this.getById(userId, orgId);
    if (org.ownerUserId !== userId) {
      throw new ForbiddenException('Only the organization owner can delete it');
    }
    await this.prisma.organization.update({
      where: { id: org.id },
      data: { deletedAt: new Date() },
    });
  }

  private async assertCanAccess(
    userId: string,
    org: { id: string; ownerUserId: string },
  ): Promise<void> {
    if (org.ownerUserId === userId) {
      return;
    }
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        userId,
        status: 'active',
        workspace: { organizationId: org.id, deletedAt: null },
      },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this organization');
    }
  }
}
