import { createHmac, timingSafeEqual } from 'node:crypto';

export function signWebhookPayload(secret: string, timestamp: string, body: string): string {
  const base = `${timestamp}.${body}`;
  return createHmac('sha256', secret).update(base).digest('hex');
}

export function verifyWebhookSignature(params: {
  secret: string;
  signatureHeader: string;
  timestampHeader: string;
  body: string;
  maxSkewSeconds?: number;
}): boolean {
  const maxSkew = params.maxSkewSeconds ?? 300;
  const ts = Number(params.timestampHeader);
  if (!Number.isFinite(ts)) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > maxSkew) {
    return false;
  }

  const expected = signWebhookPayload(params.secret, params.timestampHeader, params.body);
  const provided = params.signatureHeader.replace(/^sha256=/i, '').trim();
  if (!/^[0-9a-f]+$/i.test(provided) || provided.length !== expected.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}
