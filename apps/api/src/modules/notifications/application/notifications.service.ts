import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma, type PrismaClient } from '@prisma/client';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../../../config/config.constants';
import { PrismaService } from '../../../persistence/prisma.service';
import { QueueService } from '../../../common/queue/queue.service';
import { deliverNotification } from '../infrastructure/notification-delivery';

export const NOTIFICATION_EVENTS = {
  WELCOME: 'welcome',
  INVITATION: 'invitation',
  EXECUTION_FAILURE: 'execution_failure',
} as const;

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | '$use'
>;

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    @Inject(APP_CONFIG) private readonly config: ApiConfig,
  ) {}

  async getPreferences(userId: string) {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });
    const defaults = this.defaultPreferences();
    const map = new Map(rows.map((r) => [`${r.channel}:${r.eventType}`, r]));

    return defaults.map((d) => {
      const existing = map.get(`${d.channel}:${d.eventType}`);
      return {
        channel: d.channel,
        eventType: d.eventType,
        enabled: existing?.enabled ?? d.enabled,
        config: (existing?.config as Record<string, unknown> | null) ?? d.config,
      };
    });
  }

  async updatePreferences(
    userId: string,
    updates: Array<{
      channel: 'email' | 'slack' | 'webhook';
      eventType: string;
      enabled: boolean;
      config?: Record<string, unknown>;
    }>,
  ) {
    for (const u of updates) {
      await this.prisma.notificationPreference.upsert({
        where: {
          userId_channel_eventType: {
            userId,
            channel: u.channel,
            eventType: u.eventType,
          },
        },
        create: {
          userId,
          channel: u.channel,
          eventType: u.eventType,
          enabled: u.enabled,
          config: (u.config ?? {}) as Prisma.InputJsonValue,
        },
        update: {
          enabled: u.enabled,
          ...(u.config !== undefined ? { config: u.config as Prisma.InputJsonValue } : {}),
        },
      });
    }
    return this.getPreferences(userId);
  }

  async listWorkspace(workspaceId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      templateKey: r.templateKey,
      channel: r.channel,
      status: r.status,
      recipient: r.recipient,
      subject: r.subject,
      errorMessage: r.errorMessage,
      sentAt: r.sentAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async notifyWelcome(params: { userId: string; email: string; name: string }) {
    await this.enqueueIfEnabled({
      userId: params.userId,
      workspaceId: null,
      eventType: NOTIFICATION_EVENTS.WELCOME,
      channel: NotificationChannel.email,
      recipient: params.email,
      vars: { name: params.name, email: params.email },
      payload: { userId: params.userId },
    });
  }

  async notifyInvitation(params: {
    workspaceId: string;
    email: string;
    workspaceName: string;
    role: string;
    token: string;
    invitedByUserId: string;
  }) {
    const invitee = await this.prisma.user.findFirst({
      where: { email: params.email, deletedAt: null },
      select: { id: true },
    });

    await this.enqueueIfEnabled({
      userId: invitee?.id ?? params.invitedByUserId,
      workspaceId: params.workspaceId,
      eventType: NOTIFICATION_EVENTS.INVITATION,
      channel: NotificationChannel.email,
      recipient: params.email,
      vars: {
        workspaceName: params.workspaceName,
        role: params.role,
        token: params.token,
      },
      payload: {
        workspaceId: params.workspaceId,
        email: params.email,
      },
      skipPreferenceCheck: !invitee,
    });
  }

  async notifyExecutionFailure(params: {
    workspaceId: string;
    executionId: string;
    workflowId: string;
    errorMessage: string;
    startedByUserId?: string | null;
  }) {
    const recipients = await this.resolveWorkspaceRecipients(
      params.workspaceId,
      params.startedByUserId,
    );

    for (const user of recipients) {
      await this.enqueueIfEnabled({
        userId: user.id,
        workspaceId: params.workspaceId,
        eventType: NOTIFICATION_EVENTS.EXECUTION_FAILURE,
        channel: NotificationChannel.email,
        recipient: user.email,
        vars: {
          workspaceId: params.workspaceId,
          executionId: params.executionId,
          workflowId: params.workflowId,
          errorMessage: params.errorMessage,
        },
        payload: {
          executionId: params.executionId,
          workflowId: params.workflowId,
        },
      });

      const prefs = await this.prisma.notificationPreference.findUnique({
        where: {
          userId_channel_eventType: {
            userId: user.id,
            channel: NotificationChannel.slack,
            eventType: NOTIFICATION_EVENTS.EXECUTION_FAILURE,
          },
        },
      });
      const slackUrl =
        prefs?.enabled &&
        prefs.config &&
        typeof (prefs.config as Record<string, unknown>)['webhookUrl'] === 'string'
          ? String((prefs.config as Record<string, unknown>)['webhookUrl'])
          : null;

      if (slackUrl) {
        await this.enqueueIfEnabled({
          userId: user.id,
          workspaceId: params.workspaceId,
          eventType: NOTIFICATION_EVENTS.EXECUTION_FAILURE,
          channel: NotificationChannel.slack,
          recipient: slackUrl,
          vars: {
            workspaceId: params.workspaceId,
            executionId: params.executionId,
            workflowId: params.workflowId,
            errorMessage: params.errorMessage,
          },
          payload: {
            executionId: params.executionId,
            workflowId: params.workflowId,
          },
          forceEnabled: true,
        });
      }
    }
  }

  async deliverNow(notificationId: string): Promise<void> {
    await deliverNotification({
      prisma: this.prisma,
      notificationId,
      emailFrom: this.config.EMAIL_FROM,
      smtp: {
        host: this.config.SMTP_HOST,
        port: this.config.SMTP_PORT,
        user: this.config.SMTP_USER,
        pass: this.config.SMTP_PASS,
        secure: this.config.SMTP_SECURE,
      },
      skipNetwork: process.env['NODE_ENV'] === 'test' || !this.config.SMTP_HOST,
    });
  }

  private async enqueueIfEnabled(params: {
    userId: string;
    workspaceId: string | null;
    eventType: string;
    channel: NotificationChannel;
    recipient: string;
    vars: Record<string, string>;
    payload: Record<string, unknown>;
    skipPreferenceCheck?: boolean;
    forceEnabled?: boolean;
  }) {
    if (!params.skipPreferenceCheck && !params.forceEnabled) {
      const enabled = await this.isEnabled(params.userId, params.channel, params.eventType);
      if (!enabled) {
        this.logger.debug(
          `Skipping ${params.eventType}/${params.channel} for user ${params.userId} (disabled)`,
        );
        return;
      }
    }

    const template = await this.prisma.notificationTemplate.findUnique({
      where: {
        key_channel: { key: params.eventType, channel: params.channel },
      },
    });
    if (!template) {
      this.logger.warn(`Missing template ${params.eventType}/${params.channel}`);
      return;
    }

    const subject = template.subject ? renderTemplate(template.subject, params.vars) : null;
    const body = renderTemplate(template.body, params.vars);

    const notification = await this.prisma.notification.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        templateId: template.id,
        templateKey: params.eventType,
        channel: params.channel,
        status: NotificationStatus.pending,
        recipient: params.recipient,
        subject,
        body,
        payload: params.payload as Prisma.InputJsonValue,
      },
    });

    if (process.env['NODE_ENV'] === 'test') {
      await this.deliverNow(notification.id);
    } else {
      await this.queue.enqueueNotificationSend({ notificationId: notification.id });
    }
  }

  private async isEnabled(
    userId: string,
    channel: NotificationChannel,
    eventType: string,
  ): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: {
        userId_channel_eventType: { userId, channel, eventType },
      },
    });
    if (pref) {
      return pref.enabled;
    }
    // Defaults: email on, slack/webhook off
    return channel === NotificationChannel.email;
  }

  private async resolveWorkspaceRecipients(workspaceId: string, startedByUserId?: string | null) {
    if (startedByUserId) {
      const user = await this.prisma.user.findFirst({
        where: { id: startedByUserId, deletedAt: null },
        select: { id: true, email: true },
      });
      if (user) {
        return [user];
      }
    }

    const owners = await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        status: 'active',
        role: { in: ['owner', 'admin'] },
      },
      include: { user: { select: { id: true, email: true } } },
      take: 5,
    });
    return owners.map((m) => m.user);
  }

  private defaultPreferences() {
    return [
      {
        channel: NotificationChannel.email,
        eventType: NOTIFICATION_EVENTS.WELCOME,
        enabled: true,
        config: null as Record<string, unknown> | null,
      },
      {
        channel: NotificationChannel.email,
        eventType: NOTIFICATION_EVENTS.INVITATION,
        enabled: true,
        config: null,
      },
      {
        channel: NotificationChannel.email,
        eventType: NOTIFICATION_EVENTS.EXECUTION_FAILURE,
        enabled: true,
        config: null,
      },
      {
        channel: NotificationChannel.slack,
        eventType: NOTIFICATION_EVENTS.EXECUTION_FAILURE,
        enabled: false,
        config: null,
      },
    ];
  }
}

export type { TxClient };
