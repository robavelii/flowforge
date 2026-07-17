import { NotificationChannel, NotificationStatus, type PrismaClient } from '@prisma/client';

export type SmtpConfig = {
  host?: string | undefined;
  port: number;
  user?: string | undefined;
  pass?: string | undefined;
  secure: boolean;
};

export async function deliverNotificationJob(params: {
  prisma: PrismaClient;
  notificationId: string;
  emailFrom: string;
  smtp: SmtpConfig;
}): Promise<void> {
  const skipNetwork = !params.smtp.host || process.env['NODE_ENV'] === 'test';
  const notification = await params.prisma.notification.findUnique({
    where: { id: params.notificationId },
  });
  if (!notification || notification.status === NotificationStatus.sent) {
    return;
  }

  const attempt = notification.attemptCount + 1;

  try {
    if (skipNetwork) {
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
      console.info(
        JSON.stringify({
          msg: 'email.notification',
          from: params.emailFrom,
          to: notification.recipient,
          subject: notification.subject,
          smtpHost: params.smtp.host,
        }),
      );
    } else {
      const response = await fetch(notification.recipient, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body:
          notification.channel === NotificationChannel.slack && notification.body.startsWith('{')
            ? notification.body
            : JSON.stringify({ text: notification.body }),
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
