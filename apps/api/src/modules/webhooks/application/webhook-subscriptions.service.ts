import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Prisma, WebhookDeliveryStatus } from '@prisma/client';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../../../config/config.constants';
import { PrismaService } from '../../../persistence/prisma.service';
import { encryptSecret, generateOpaqueToken } from '../../../common/utils/crypto.util';
import {
  assertSafeOutboundUrl,
  assertSafeOutboundUrlResolved,
} from '../../../common/ssrf/ssrf.util';
import { QueueService } from '../../../common/queue/queue.service';
import { AuditService } from '../../audit/application/audit.service';
import { deliverOutboundWebhook } from '../infrastructure/outbound-delivery';

@Injectable()
export class WebhookSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: ApiConfig,
  ) {}

  async list(workspaceId: string) {
    const rows = await this.prisma.webhookSubscription.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(
    workspaceId: string,
    userId: string,
    input: { name: string; targetUrl: string; eventTypes: string[] },
  ) {
    assertSafeOutboundUrl(input.targetUrl);
    if (process.env['NODE_ENV'] !== 'test') {
      await assertSafeOutboundUrlResolved(input.targetUrl);
    }

    const signingSecret = generateOpaqueToken(32);
    const signingSecretEnc = encryptSecret(signingSecret, this.config.SECRETS_ENCRYPTION_KEY);

    const sub = await this.prisma.webhookSubscription.create({
      data: {
        workspaceId,
        name: input.name.trim(),
        targetUrl: input.targetUrl.trim(),
        signingSecretEnc,
        eventTypes: input.eventTypes,
      },
    });

    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'webhook_subscription.created',
      resourceType: 'WebhookSubscription',
      resourceId: sub.id,
    });

    return {
      ...this.toDto(sub),
      signingSecret,
    };
  }

  async update(
    workspaceId: string,
    subscriptionId: string,
    input: { name?: string; targetUrl?: string; eventTypes?: string[]; enabled?: boolean },
  ) {
    await this.require(workspaceId, subscriptionId);
    if (input.targetUrl) {
      assertSafeOutboundUrl(input.targetUrl);
      if (process.env['NODE_ENV'] !== 'test') {
        await assertSafeOutboundUrlResolved(input.targetUrl);
      }
    }

    const updated = await this.prisma.webhookSubscription.update({
      where: { id: subscriptionId },
      data: {
        name: input.name?.trim(),
        targetUrl: input.targetUrl?.trim(),
        eventTypes: input.eventTypes,
        enabled: input.enabled,
      },
    });
    return this.toDto(updated);
  }

  async remove(workspaceId: string, subscriptionId: string, userId: string) {
    await this.require(workspaceId, subscriptionId);
    await this.prisma.webhookSubscription.update({
      where: { id: subscriptionId },
      data: { deletedAt: new Date(), enabled: false },
    });
    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'webhook_subscription.deleted',
      resourceType: 'WebhookSubscription',
      resourceId: subscriptionId,
    });
  }

  async listDeliveries(workspaceId: string, opts?: { subscriptionId?: string }) {
    const rows = await this.prisma.webhookDelivery.findMany({
      where: {
        workspaceId,
        ...(opts?.subscriptionId ? { subscriptionId: opts.subscriptionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      subscriptionId: r.subscriptionId,
      eventType: r.eventType,
      eventId: r.eventId,
      status: r.status,
      attemptCount: r.attemptCount,
      httpStatus: r.httpStatus,
      responseBody: r.responseBody,
      nextRetryAt: r.nextRetryAt?.toISOString() ?? null,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async enqueueForEvent(params: {
    workspaceId: string;
    eventType: string;
    eventId: string;
    payload: Record<string, unknown>;
  }) {
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: {
        workspaceId: params.workspaceId,
        deletedAt: null,
        enabled: true,
        OR: [{ eventTypes: { has: params.eventType } }, { eventTypes: { has: '*' } }],
      },
    });

    for (const sub of subscriptions) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          workspaceId: params.workspaceId,
          subscriptionId: sub.id,
          eventType: params.eventType,
          eventId: params.eventId,
          payload: params.payload as Prisma.InputJsonValue,
          status: WebhookDeliveryStatus.pending,
        },
      });

      if (process.env['NODE_ENV'] === 'test') {
        await deliverOutboundWebhook({
          prisma: this.prisma,
          deliveryId: delivery.id,
          encryptionKey: this.config.SECRETS_ENCRYPTION_KEY,
          skipNetwork: true,
        });
      } else {
        await this.queue.enqueueWebhookOutbound({
          deliveryId: delivery.id,
          workspaceId: params.workspaceId,
        });
      }
    }
  }

  async retry(workspaceId: string, deliveryId: string) {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, workspaceId },
    });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    if (
      delivery.status !== WebhookDeliveryStatus.failed &&
      delivery.status !== WebhookDeliveryStatus.dead_lettered
    ) {
      throw new BadRequestException('Only failed deliveries can be retried');
    }

    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: WebhookDeliveryStatus.pending,
        nextRetryAt: null,
      },
    });

    if (process.env['NODE_ENV'] === 'test') {
      await deliverOutboundWebhook({
        prisma: this.prisma,
        deliveryId,
        encryptionKey: this.config.SECRETS_ENCRYPTION_KEY,
        skipNetwork: true,
      });
    } else {
      await this.queue.enqueueWebhookOutbound({
        deliveryId,
        workspaceId,
      });
    }

    const refreshed = await this.prisma.webhookDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    return {
      id: refreshed.id,
      status: refreshed.status,
      attemptCount: refreshed.attemptCount,
    };
  }

  private async require(workspaceId: string, subscriptionId: string) {
    const sub = await this.prisma.webhookSubscription.findFirst({
      where: { id: subscriptionId, workspaceId, deletedAt: null },
    });
    if (!sub) {
      throw new NotFoundException('Webhook subscription not found');
    }
    return sub;
  }

  private toDto(sub: {
    id: string;
    workspaceId: string;
    name: string;
    targetUrl: string;
    eventTypes: string[];
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: sub.id,
      workspaceId: sub.workspaceId,
      name: sub.name,
      targetUrl: sub.targetUrl,
      eventTypes: sub.eventTypes,
      enabled: sub.enabled,
      createdAt: sub.createdAt.toISOString(),
      updatedAt: sub.updatedAt.toISOString(),
    };
  }
}
