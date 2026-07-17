import { Injectable, NotFoundException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma.service';
import { QuotaService } from '../../../common/quota/quota.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotas: QuotaService,
  ) {}

  listPlans() {
    return this.prisma.plan
      .findMany({
        orderBy: { executionsPerMonth: 'asc' },
      })
      .then((rows) => rows.map((p) => this.toPlanDto(p)));
  }

  async getSubscription(workspaceId: string) {
    const plan = await this.quotas.resolvePlan(workspaceId);
    let sub = await this.prisma.subscription.findFirst({
      where: {
        workspaceId,
        status: { in: [SubscriptionStatus.active, SubscriptionStatus.trialing] },
      },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    if (!sub) {
      const period = this.quotas.currentCalendarMonth();
      const nextMonth = new Date(
        Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth() + 1, 1),
      );
      sub = await this.prisma.subscription.create({
        data: {
          workspaceId,
          planId: plan.id,
          status: SubscriptionStatus.active,
          currentPeriodStart: period.start,
          currentPeriodEnd: nextMonth,
        },
        include: { plan: true },
      });
    }

    return {
      id: sub.id,
      workspaceId: sub.workspaceId,
      status: sub.status,
      plan: this.toPlanDto(sub.plan),
      externalCustomerId: sub.externalCustomerId,
      externalSubscriptionId: sub.externalSubscriptionId,
      currentPeriodStart: sub.currentPeriodStart.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      canceledAt: sub.canceledAt?.toISOString() ?? null,
    };
  }

  async listUsage(workspaceId: string, opts: { metric?: string; limit: number }) {
    const rows = await this.prisma.usageRecord.findMany({
      where: {
        workspaceId,
        ...(opts.metric ? { metric: opts.metric } : {}),
      },
      orderBy: { recordedAt: 'desc' },
      take: opts.limit,
    });
    return rows.map((r) => ({
      id: r.id,
      metric: r.metric,
      quantity: Number(r.quantity),
      periodKey: r.periodKey,
      metadata: r.metadata,
      recordedAt: r.recordedAt.toISOString(),
    }));
  }

  async changePlan(workspaceId: string, planSlug: string) {
    const plan = await this.prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { planId: plan.id },
    });

    const period = this.quotas.currentCalendarMonth();
    const nextMonth = new Date(
      Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth() + 1, 1),
    );

    await this.prisma.subscription.updateMany({
      where: {
        workspaceId,
        status: { in: [SubscriptionStatus.active, SubscriptionStatus.trialing] },
      },
      data: { status: SubscriptionStatus.canceled, canceledAt: new Date() },
    });

    const sub = await this.prisma.subscription.create({
      data: {
        workspaceId,
        planId: plan.id,
        status: SubscriptionStatus.active,
        currentPeriodStart: period.start,
        currentPeriodEnd: nextMonth,
      },
      include: { plan: true },
    });

    return {
      id: sub.id,
      workspaceId: sub.workspaceId,
      status: sub.status,
      plan: this.toPlanDto(sub.plan),
      externalCustomerId: sub.externalCustomerId,
      externalSubscriptionId: sub.externalSubscriptionId,
      currentPeriodStart: sub.currentPeriodStart.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      canceledAt: null,
    };
  }

  private toPlanDto(plan: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    executionsPerMonth: number;
    storageBytes: bigint;
    apiRequestsPerMinute: number;
    softLimitPercent: number;
    isDefault: boolean;
  }) {
    return {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      description: plan.description,
      executionsPerMonth: plan.executionsPerMonth,
      storageBytes: Number(plan.storageBytes),
      apiRequestsPerMinute: plan.apiRequestsPerMinute,
      softLimitPercent: plan.softLimitPercent,
      isDefault: plan.isDefault,
    };
  }
}
