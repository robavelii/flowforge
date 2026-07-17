import { WebhookDeliveryStatus, type PrismaClient } from '@prisma/client';
import { decryptSecret } from '../../../common/utils/crypto.util';
import { assertSafeOutboundUrl } from '../../../common/ssrf/ssrf.util';
import { signWebhookPayload } from '../../../common/webhooks/webhook-signature.util';

const MAX_ATTEMPTS = 5;

export async function deliverOutboundWebhook(params: {
  prisma: PrismaClient;
  deliveryId: string;
  encryptionKey: string;
  skipNetwork?: boolean;
}): Promise<void> {
  const delivery = await params.prisma.webhookDelivery.findUnique({
    where: { id: params.deliveryId },
    include: { subscription: true },
  });
  if (!delivery || !delivery.subscription) {
    return;
  }
  if (delivery.subscription.deletedAt || !delivery.subscription.enabled) {
    await params.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: WebhookDeliveryStatus.dead_lettered,
        responseBody: 'Subscription disabled',
      },
    });
    return;
  }

  const attempt = delivery.attemptCount + 1;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    id: delivery.eventId,
    type: delivery.eventType,
    created_at: new Date().toISOString(),
    data: delivery.payload,
  });

  const secret = decryptSecret(delivery.subscription.signingSecretEnc, params.encryptionKey);
  const signature = signWebhookPayload(secret, timestamp, body);

  if (params.skipNetwork) {
    await params.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: WebhookDeliveryStatus.delivered,
        attemptCount: attempt,
        httpStatus: 200,
        responseBody: '{"mocked":true}',
        deliveredAt: new Date(),
        nextRetryAt: null,
      },
    });
    return;
  }

  try {
    assertSafeOutboundUrl(delivery.subscription.targetUrl);
    const response = await fetch(delivery.subscription.targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-flowforge-signature': `sha256=${signature}`,
        'x-flowforge-timestamp': timestamp,
        'x-flowforge-event-id': delivery.eventId,
        'x-flowforge-event-type': delivery.eventType,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    const responseBody = (await response.text()).slice(0, 2000);
    if (response.ok) {
      await params.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.delivered,
          attemptCount: attempt,
          httpStatus: response.status,
          responseBody,
          deliveredAt: new Date(),
          nextRetryAt: null,
        },
      });
      return;
    }

    await markFailure(params.prisma, delivery.id, attempt, response.status, responseBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delivery failed';
    await markFailure(params.prisma, delivery.id, attempt, null, message);
  }
}

async function markFailure(
  prisma: PrismaClient,
  deliveryId: string,
  attempt: number,
  httpStatus: number | null,
  responseBody: string,
): Promise<void> {
  const dead = attempt >= MAX_ATTEMPTS;
  const nextRetryAt = dead ? null : new Date(Date.now() + 1000 * 2 ** Math.min(attempt, 6));

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: dead ? WebhookDeliveryStatus.dead_lettered : WebhookDeliveryStatus.failed,
      attemptCount: attempt,
      httpStatus,
      responseBody: responseBody.slice(0, 2000),
      nextRetryAt,
    },
  });
}
