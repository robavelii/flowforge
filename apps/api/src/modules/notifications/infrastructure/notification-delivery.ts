import { NotificationChannel, NotificationStatus, type PrismaClient } from '@prisma/client';

export type SmtpConfig = {
  host?: string;
  port: number;
  user?: string;
  pass?: string;
  secure: boolean;
};

function isPrivateOrLocalUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return true;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) {
    return true;
  }
  return false;
}

export async function deliverNotification(params: {
  prisma: PrismaClient;
  notificationId: string;
  emailFrom: string;
  smtp: SmtpConfig;
  skipNetwork?: boolean;
}): Promise<void> {
  const notification = await params.prisma.notification.findUnique({
    where: { id: params.notificationId },
  });
  if (!notification || notification.status === NotificationStatus.sent) {
    return;
  }

  const attempt = notification.attemptCount + 1;

  try {
    if (params.skipNetwork) {
      await params.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.sent,
          attemptCount: attempt,
          sentAt: new Date(),
          errorMessage: null,
        },
      });
      return;
    }

    if (notification.channel === NotificationChannel.email) {
      // Without nodemailer, production SMTP is a log adapter until M7 hardening.
      // Require SMTP_HOST to be present; otherwise treat as configuration error.
      if (!params.smtp.host) {
        throw new Error('SMTP_HOST is not configured');
      }
      // Structured log sink — replace with real SMTP transport when available.
      console.info(
        JSON.stringify({
          msg: 'email.notification',
          from: params.emailFrom,
          to: notification.recipient,
          subject: notification.subject,
          smtpHost: params.smtp.host,
        }),
      );
    } else if (
      notification.channel === NotificationChannel.slack ||
      notification.channel === NotificationChannel.webhook
    ) {
      if (isPrivateOrLocalUrl(notification.recipient)) {
        throw new Error('Private or local webhook URLs are not allowed');
      }
      const body =
        notification.channel === NotificationChannel.slack && notification.body.startsWith('{')
          ? notification.body
          : JSON.stringify(
              notification.channel === NotificationChannel.slack
                ? { text: notification.body }
                : {
                    subject: notification.subject,
                    body: notification.body,
                    payload: notification.payload,
                  },
            );
      const response = await fetch(notification.recipient, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Delivery returned HTTP ${String(response.status)}`);
      }
    }

    await params.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: NotificationStatus.sent,
        attemptCount: attempt,
        sentAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delivery failed';
    await params.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: NotificationStatus.failed,
        attemptCount: attempt,
        errorMessage: message.slice(0, 2000),
      },
    });
    throw err;
  }
}
