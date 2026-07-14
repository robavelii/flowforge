import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../../persistence/prisma.service';

export type OutboxWriteInput = {
  workspaceId?: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
};

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | '$use'
>;

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: OutboxWriteInput, tx?: TxClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.outboxEvent.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        payload: input.payload,
        metadata: input.metadata ?? undefined,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  }

  async claimUnpublished(limit = 50): Promise<
    Array<{
      id: string;
      eventType: string;
      payload: Prisma.JsonValue;
      workspaceId: string | null;
    }>
  > {
    const events = await this.prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        eventType: true,
        payload: true,
        workspaceId: true,
      },
    });
    return events;
  }

  async markPublished(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.outboxEvent.updateMany({
      where: { id: { in: ids } },
      data: { publishedAt: new Date() },
    });
  }
}
