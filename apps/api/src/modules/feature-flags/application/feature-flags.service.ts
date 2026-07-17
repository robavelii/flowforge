import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

const CACHE_TTL_SECONDS = 60;

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async list(workspaceId: string) {
    const rows = await this.prisma.featureFlag.findMany({
      where: { workspaceId },
      orderBy: { key: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async isEnabled(workspaceId: string, key: string, defaultEnabled = false): Promise<boolean> {
    const cacheKey = `ff:${workspaceId}:${key}`;
    try {
      const cached = await this.redis.client.get(cacheKey);
      if (cached === '1') return true;
      if (cached === '0') return false;
    } catch {
      // ignore
    }

    const row = await this.prisma.featureFlag.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    const enabled = row?.enabled ?? defaultEnabled;
    try {
      await this.redis.client.set(cacheKey, enabled ? '1' : '0', 'EX', CACHE_TTL_SECONDS);
    } catch {
      // ignore
    }
    return enabled;
  }

  async upsert(
    workspaceId: string,
    input: { key: string; enabled: boolean; description?: string; metadata?: unknown },
  ) {
    const row = await this.prisma.featureFlag.upsert({
      where: { workspaceId_key: { workspaceId, key: input.key } },
      update: {
        enabled: input.enabled,
        description: input.description ?? undefined,
        metadata:
          input.metadata === undefined ? undefined : (input.metadata as Prisma.InputJsonValue),
      },
      create: {
        workspaceId,
        key: input.key,
        enabled: input.enabled,
        description: input.description ?? null,
        metadata:
          input.metadata === undefined ? undefined : (input.metadata as Prisma.InputJsonValue),
      },
    });
    await this.invalidate(workspaceId, input.key);
    return this.toDto(row);
  }

  async remove(workspaceId: string, key: string) {
    const existing = await this.prisma.featureFlag.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    if (!existing) {
      throw new NotFoundException('Feature flag not found');
    }
    await this.prisma.featureFlag.delete({ where: { id: existing.id } });
    await this.invalidate(workspaceId, key);
  }

  private async invalidate(workspaceId: string, key: string) {
    try {
      await this.redis.client.del(`ff:${workspaceId}:${key}`);
    } catch {
      // ignore
    }
  }

  private toDto(row: {
    id: string;
    key: string;
    enabled: boolean;
    description: string | null;
    metadata: Prisma.JsonValue;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      key: row.key,
      enabled: row.enabled,
      description: row.description,
      metadata: row.metadata,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
