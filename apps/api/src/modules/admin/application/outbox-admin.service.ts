import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../persistence/prisma.service';

@Injectable()
export class OutboxAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string, opts: { unpublishedOnly?: boolean; limit: number }) {
    const rows = await this.prisma.outboxEvent.findMany({
      where: {
        workspaceId,
        ...(opts.unpublishedOnly ? { publishedAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
      select: {
        id: true,
        eventType: true,
        aggregateType: true,
        aggregateId: true,
        occurredAt: true,
        publishedAt: true,
        publishAttempts: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      aggregateType: r.aggregateType,
      aggregateId: r.aggregateId,
      occurredAt: r.occurredAt.toISOString(),
      publishedAt: r.publishedAt?.toISOString() ?? null,
      publishAttempts: r.publishAttempts,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async replay(workspaceId: string, eventId: string) {
    const event = await this.prisma.outboxEvent.findFirst({
      where: { id: eventId, workspaceId },
    });
    if (!event) {
      throw new NotFoundException('Outbox event not found');
    }
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: { publishedAt: null },
    });
    return {
      id: eventId,
      replayed: true,
      eventType: event.eventType,
    };
  }
}
