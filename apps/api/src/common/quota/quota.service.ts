import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { PrismaService } from '../../persistence/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { RedisService } from '../redis/redis.service';
import { QUOTA_METRIC, type QuotaMetric } from './quota.constants';

export type QuotaSnapshot = {
  metric: QuotaMetric;
  current: number;
  limit: number;
  remaining: number;
  softLimitPercent: number;
  periodStart: string;
  periodEnd: string;
  percentUsed: number;
};

@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly redis: RedisService,
  ) {}

  async resolvePlan(workspaceId: string): Promise<Plan> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      include: { plan: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    if (workspace.plan) {
      return workspace.plan;
    }
    const fallback =
      (await this.prisma.plan.findFirst({ where: { isDefault: true } })) ??
      (await this.prisma.plan.findFirst({ where: { slug: 'free' } }));
    if (!fallback) {
      throw new NotFoundException('No billing plan configured; run db seed');
    }
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { planId: fallback.id },
    });
    return fallback;
  }

  async listQuotas(workspaceId: string): Promise<QuotaSnapshot[]> {
    const plan = await this.resolvePlan(workspaceId);
    const period = this.currentCalendarMonth();

    const [executions, storage] = await Promise.all([
      this.ensureUsageRow(
        workspaceId,
        QUOTA_METRIC.EXECUTIONS,
        period,
        BigInt(plan.executionsPerMonth),
      ),
      this.ensureUsageRow(workspaceId, QUOTA_METRIC.STORAGE_BYTES, period, plan.storageBytes),
    ]);

    const apiCurrent = await this.readApiWindowCount(workspaceId);

    return [
      this.toSnapshot(QUOTA_METRIC.EXECUTIONS, executions, plan.softLimitPercent),
      this.toSnapshot(QUOTA_METRIC.STORAGE_BYTES, storage, plan.softLimitPercent),
      {
        metric: QUOTA_METRIC.API_REQUESTS,
        current: apiCurrent,
        limit: plan.apiRequestsPerMinute,
        remaining: Math.max(0, plan.apiRequestsPerMinute - apiCurrent),
        softLimitPercent: plan.softLimitPercent,
        periodStart: new Date(Date.now() - 60_000).toISOString(),
        periodEnd: new Date().toISOString(),
        percentUsed:
          plan.apiRequestsPerMinute <= 0
            ? 100
            : Math.min(100, Math.round((apiCurrent / plan.apiRequestsPerMinute) * 100)),
      },
    ];
  }

  /** Hard-check + consume one execution. Sandbox runs skip quota. */
  async consumeExecution(workspaceId: string, opts: { sandbox: boolean }): Promise<void> {
    if (opts.sandbox) {
      return;
    }
    const plan = await this.resolvePlan(workspaceId);
    const period = this.currentCalendarMonth();
    const row = await this.ensureUsageRow(
      workspaceId,
      QUOTA_METRIC.EXECUTIONS,
      period,
      BigInt(plan.executionsPerMonth),
    );

    if (row.currentValue >= row.limitValue) {
      await this.emitExceeded(workspaceId, QUOTA_METRIC.EXECUTIONS, 'enqueue_execution');
      throw this.quotaExceededException(QUOTA_METRIC.EXECUTIONS, row);
    }

    const updated = await this.prisma.quotaUsage.update({
      where: { id: row.id },
      data: { currentValue: { increment: 1 } },
    });

    await this.prisma.usageRecord.create({
      data: {
        workspaceId,
        metric: QUOTA_METRIC.EXECUTIONS,
        quantity: 1n,
        periodKey: this.periodKey(period.start),
        metadata: { source: 'execution' },
      },
    });

    await this.maybeEmitThreshold(
      workspaceId,
      QUOTA_METRIC.EXECUTIONS,
      updated.currentValue,
      updated.limitValue,
      plan.softLimitPercent,
    );
  }

  async consumeStorage(workspaceId: string, bytes: number): Promise<void> {
    if (bytes <= 0) {
      return;
    }
    const plan = await this.resolvePlan(workspaceId);
    const period = this.currentCalendarMonth();
    const row = await this.ensureUsageRow(
      workspaceId,
      QUOTA_METRIC.STORAGE_BYTES,
      period,
      plan.storageBytes,
    );

    if (row.currentValue + BigInt(bytes) > row.limitValue) {
      await this.emitExceeded(workspaceId, QUOTA_METRIC.STORAGE_BYTES, 'upload_file');
      throw this.quotaExceededException(QUOTA_METRIC.STORAGE_BYTES, row);
    }

    const updated = await this.prisma.quotaUsage.update({
      where: { id: row.id },
      data: { currentValue: { increment: bytes } },
    });

    await this.prisma.usageRecord.create({
      data: {
        workspaceId,
        metric: QUOTA_METRIC.STORAGE_BYTES,
        quantity: BigInt(bytes),
        periodKey: this.periodKey(period.start),
        metadata: { source: 'file_upload' },
      },
    });

    await this.maybeEmitThreshold(
      workspaceId,
      QUOTA_METRIC.STORAGE_BYTES,
      updated.currentValue,
      updated.limitValue,
      plan.softLimitPercent,
    );
  }

  /** Enforce plan API requests/minute when workspace context is known. */
  async consumeApiRequest(workspaceId: string): Promise<void> {
    const plan = await this.resolvePlan(workspaceId);
    const key = `quota:api:${workspaceId}`;
    try {
      const count = await this.redis.client.incr(key);
      if (count === 1) {
        await this.redis.client.expire(key, 60);
      }
      if (count > plan.apiRequestsPerMinute) {
        const ttl = await this.redis.client.ttl(key);
        await this.emitExceeded(workspaceId, QUOTA_METRIC.API_REQUESTS, 'api_request');
        throw new HttpException(
          {
            message: 'API request quota exceeded for workspace plan',
            error: 'quota-exceeded',
            metric: QUOTA_METRIC.API_REQUESTS,
            retryAfter: ttl > 0 ? ttl : 60,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      // Redis unavailable — fail open for API quota only
    }
  }

  private async readApiWindowCount(workspaceId: string): Promise<number> {
    try {
      const raw = await this.redis.client.get(`quota:api:${workspaceId}`);
      return raw ? Number(raw) : 0;
    } catch {
      return 0;
    }
  }

  private async ensureUsageRow(
    workspaceId: string,
    metric: QuotaMetric,
    period: { start: Date; end: Date },
    limitValue: bigint,
  ) {
    const existing = await this.prisma.quotaUsage.findUnique({
      where: {
        workspaceId_metric_periodStart: {
          workspaceId,
          metric,
          periodStart: period.start,
        },
      },
    });
    if (existing) {
      if (existing.limitValue !== limitValue) {
        return this.prisma.quotaUsage.update({
          where: { id: existing.id },
          data: { limitValue },
        });
      }
      return existing;
    }
    return this.prisma.quotaUsage.create({
      data: {
        workspaceId,
        metric,
        periodStart: period.start,
        periodEnd: period.end,
        currentValue: 0n,
        limitValue,
      },
    });
  }

  private async maybeEmitThreshold(
    workspaceId: string,
    metric: QuotaMetric,
    current: bigint,
    limit: bigint,
    softLimitPercent: number,
  ): Promise<void> {
    if (limit <= 0n) {
      return;
    }
    const percent = Number((current * 100n) / limit);
    if (percent < softLimitPercent) {
      return;
    }
    const dedupeKey = `quota:threshold:${workspaceId}:${metric}:${this.periodKey(this.currentCalendarMonth().start)}`;
    try {
      const set = await this.redis.client.set(dedupeKey, '1', 'EX', 60 * 60 * 24 * 40, 'NX');
      if (set !== 'OK') {
        return;
      }
    } catch {
      // continue without dedupe if redis down
    }

    await this.outbox.append({
      workspaceId,
      aggregateType: 'Quota',
      aggregateId: workspaceId,
      eventType: 'QuotaThresholdReached',
      payload: {
        workspaceId,
        quotaType: metric,
        current: Number(current),
        limit: Number(limit),
        thresholdPercent: softLimitPercent,
      },
    });
  }

  private async emitExceeded(
    workspaceId: string,
    metric: QuotaMetric,
    action: string,
  ): Promise<void> {
    await this.outbox.append({
      workspaceId,
      aggregateType: 'Quota',
      aggregateId: workspaceId,
      eventType: 'QuotaExceeded',
      payload: {
        workspaceId,
        quotaType: metric,
        action,
      },
    });
  }

  private quotaExceededException(
    metric: QuotaMetric,
    row: { currentValue: bigint; limitValue: bigint; periodEnd: Date },
  ): HttpException {
    const retryAfter = Math.max(1, Math.ceil((row.periodEnd.getTime() - Date.now()) / 1000));
    return new HttpException(
      {
        message: `Workspace ${metric} quota exceeded`,
        error: 'quota-exceeded',
        metric,
        current: Number(row.currentValue),
        limit: Number(row.limitValue),
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private toSnapshot(
    metric: QuotaMetric,
    row: {
      currentValue: bigint;
      limitValue: bigint;
      periodStart: Date;
      periodEnd: Date;
    },
    softLimitPercent: number,
  ): QuotaSnapshot {
    const current = Number(row.currentValue);
    const limit = Number(row.limitValue);
    return {
      metric,
      current,
      limit,
      remaining: Math.max(0, limit - current),
      softLimitPercent,
      periodStart: row.periodStart.toISOString().slice(0, 10),
      periodEnd: row.periodEnd.toISOString().slice(0, 10),
      percentUsed: limit <= 0 ? 100 : Math.min(100, Math.round((current / limit) * 100)),
    };
  }

  currentCalendarMonth(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return { start, end };
  }

  periodKey(start: Date): string {
    return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}
