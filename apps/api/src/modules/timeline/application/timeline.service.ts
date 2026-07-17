import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaReadService } from '../../../persistence/prisma-read.service';
import { PrismaService } from '../../../persistence/prisma.service';

@Injectable()
export class TimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly read: PrismaReadService,
  ) {}

  async project(params: {
    workspaceId: string;
    actorUserId?: string | null;
    eventType: string;
    title: string;
    summary?: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Prisma.InputJsonValue;
    occurredAt?: Date;
  }): Promise<void> {
    await this.prisma.timelineEvent.create({
      data: {
        workspaceId: params.workspaceId,
        actorUserId: params.actorUserId ?? null,
        eventType: params.eventType,
        title: params.title,
        summary: params.summary,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        metadata: params.metadata ?? undefined,
        occurredAt: params.occurredAt ?? new Date(),
      },
    });
  }

  async list(params: { workspaceId: string; cursor?: string; limit: number }) {
    const items = await this.read.client.timelineEvent.findMany({
      where: { workspaceId: params.workspaceId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor
        ? {
            cursor: { id: params.cursor },
            skip: 1,
          }
        : {}),
    });

    const hasMore = items.length > params.limit;
    const data = hasMore ? items.slice(0, params.limit) : items;
    return {
      data,
      meta: {
        nextCursor: hasMore ? (data[data.length - 1]?.id ?? null) : null,
        prevCursor: null,
        hasMore,
      },
    };
  }
}
