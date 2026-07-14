import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OutboxService } from './outbox.service';
import { PrismaService } from '../../persistence/prisma.service';

/**
 * Outbox relay — publishes events and projects them to the activity timeline.
 * BullMQ fan-out for external consumers arrives in later milestones.
 */
@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, 5000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const events = await this.outbox.claimUnpublished(50);
      if (events.length === 0) {
        return;
      }
      this.logger.debug(`Relaying ${String(events.length)} outbox event(s)`);

      for (const event of events) {
        await this.projectTimeline(event);
      }

      await this.outbox.markPublished(events.map((e) => e.id));
    } catch (err) {
      this.logger.error({ err }, 'Outbox relay failed');
    } finally {
      this.running = false;
    }
  }

  private async projectTimeline(event: {
    id: string;
    eventType: string;
    payload: Prisma.JsonValue;
    workspaceId: string | null;
  }): Promise<void> {
    if (!event.workspaceId) {
      return;
    }

    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const titles: Record<string, string> = {
      WorkspaceCreated: 'Workspace created',
      MemberAdded: 'Member added',
      ApiKeyCreated: 'API key created',
      ApiKeyRevoked: 'API key revoked',
      RoleCreated: 'Role created',
      RoleUpdated: 'Role updated',
      RoleDeleted: 'Role deleted',
    };

    const title = titles[event.eventType];
    if (!title) {
      return;
    }

    await this.prisma.timelineEvent.create({
      data: {
        workspaceId: event.workspaceId,
        actorUserId: typeof payload['createdBy'] === 'string' ? payload['createdBy'] : null,
        eventType: event.eventType,
        title,
        summary: JSON.stringify(payload).slice(0, 500),
        resourceType: typeof payload['aggregateType'] === 'string' ? undefined : event.eventType,
        metadata: payload as Prisma.InputJsonValue,
        occurredAt: new Date(),
      },
    });
  }
}
