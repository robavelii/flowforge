import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertWorkflowDocument(params: {
    workspaceId: string;
    workflowId: string;
    title: string;
    body: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.searchDocument.upsert({
      where: {
        workspaceId_entityType_entityId: {
          workspaceId: params.workspaceId,
          entityType: 'workflow',
          entityId: params.workflowId,
        },
      },
      create: {
        workspaceId: params.workspaceId,
        entityType: 'workflow',
        entityId: params.workflowId,
        title: params.title,
        body: params.body,
        metadata: params.metadata,
      },
      update: {
        title: params.title,
        body: params.body,
        metadata: params.metadata,
      },
    });
  }

  async removeWorkflowDocument(workspaceId: string, workflowId: string): Promise<void> {
    await this.prisma.searchDocument.deleteMany({
      where: {
        workspaceId,
        entityType: 'workflow',
        entityId: workflowId,
      },
    });
  }

  async search(workspaceId: string, query: string, limit = 20) {
    const q = query.trim();
    if (!q) {
      return { data: [], meta: { query: q, limit } };
    }

    const data = await this.prisma.searchDocument.findMany({
      where: {
        workspaceId,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { body: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(limit, 50),
    });

    return {
      data: data.map((d) => ({
        id: d.id,
        entityType: d.entityType,
        entityId: d.entityId,
        title: d.title,
        body: d.body,
        metadata: d.metadata,
        updatedAt: d.updatedAt.toISOString(),
      })),
      meta: { query: q, limit },
    };
  }
}
