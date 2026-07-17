import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    const rows = await this.prisma.tenantSetting.findMany({
      where: { workspaceId },
      orderBy: { key: 'asc' },
    });
    return rows.map((r) => ({
      key: r.key,
      value: r.value,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async upsert(
    workspaceId: string,
    entries: Array<{ key: string; value: unknown }>,
  ) {
    const results = [];
    for (const entry of entries) {
      const row = await this.prisma.tenantSetting.upsert({
        where: {
          workspaceId_key: { workspaceId, key: entry.key },
        },
        update: { value: entry.value as Prisma.InputJsonValue },
        create: {
          workspaceId,
          key: entry.key,
          value: entry.value as Prisma.InputJsonValue,
        },
      });
      results.push({
        key: row.key,
        value: row.value,
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    return results;
  }
}
