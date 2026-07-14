import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma.service';

export type AuditWriteInput = {
  workspaceId?: string | null;
  actorUserId?: string | null;
  actorApiKeyId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
  userAgent?: string;
  correlationId?: string;
  reason?: string;
};

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | '$use'
>;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(input: AuditWriteInput, tx?: TxClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorApiKeyId: input.actorApiKeyId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        before: input.before ?? undefined,
        after: input.after ?? input.metadata ?? undefined,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        reason: input.reason,
      },
    });
  }

  async list(params: {
    workspaceId: string;
    cursor?: string;
    limit: number;
    action?: string;
  }) {
    const items = await this.prisma.auditLog.findMany({
      where: {
        workspaceId: params.workspaceId,
        ...(params.action ? { action: params.action } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
        nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null,
        prevCursor: null,
        hasMore,
      },
    };
  }
}
