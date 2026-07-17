import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { WebhookDeliveryStatus, type PrismaClient } from '@prisma/client';

function encryptSecret(plaintext: string, keyMaterial: string): string {
  const key = createHash('sha256').update(keyMaterial).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(payload: string, keyMaterial: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted payload');
  }
  const key = createHash('sha256').update(keyMaterial).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

function signWebhookPayload(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function assertSafeOutboundUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only http/https URLs are allowed');
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new Error('Private hostnames are not allowed');
  }
  if (isIP(hostname) === 4) {
    const [a, b] = hostname.split('.').map(Number);
    if (
      a === 10 ||
      a === 127 ||
      (a === 192 && b === 168) ||
      (a === 172 && b !== undefined && b >= 16 && b <= 31)
    ) {
      throw new Error('Private IP addresses are not allowed');
    }
  }
  return url;
}

const MAX_ATTEMPTS = 5;

export async function deliverOutboundWebhookJob(params: {
  prisma: PrismaClient;
  deliveryId: string;
  encryptionKey: string;
}): Promise<void> {
  const delivery = await params.prisma.webhookDelivery.findUnique({
    where: { id: params.deliveryId },
    include: { subscription: true },
  });
  if (!delivery?.subscription) {
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
    const dead = attempt >= MAX_ATTEMPTS;
    await params.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: dead ? WebhookDeliveryStatus.dead_lettered : WebhookDeliveryStatus.failed,
        attemptCount: attempt,
        httpStatus: response.status,
        responseBody,
        nextRetryAt: dead ? null : new Date(Date.now() + 1000 * 2 ** attempt),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delivery failed';
    const dead = attempt >= MAX_ATTEMPTS;
    await params.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: dead ? WebhookDeliveryStatus.dead_lettered : WebhookDeliveryStatus.failed,
        attemptCount: attempt,
        responseBody: message.slice(0, 2000),
        nextRetryAt: dead ? null : new Date(Date.now() + 1000 * 2 ** attempt),
      },
    });
  }
}

export { encryptSecret, decryptSecret, timingSafeEqual };
