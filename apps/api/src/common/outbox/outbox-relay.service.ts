import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OutboxService } from './outbox.service';
import { PrismaService } from '../../persistence/prisma.service';
import { SearchService } from '../../modules/workflows/application/search.service';
import { WorkflowCacheService } from '../../modules/workflows/infrastructure/workflow-cache.service';

/**
 * Outbox relay — publishes events, projects timeline + search, invalidates caches.
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
    private readonly search: SearchService,
    private readonly workflowCache: WorkflowCacheService,
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
        await this.projectSearchAndCache(event);
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
      WorkflowCreated: 'Workflow created',
      WorkflowUpdated: 'Workflow updated',
      WorkflowPublished: 'Workflow published',
      WorkflowUnpublished: 'Workflow unpublished',
      WorkflowDeleted: 'Workflow deleted',
      ExecutionQueued: 'Execution queued',
      ExecutionCompleted: 'Execution completed',
      ExecutionFailed: 'Execution failed',
    };

    const title = titles[event.eventType];
    if (!title) {
      return;
    }

    const actor =
      (typeof payload['createdBy'] === 'string' && payload['createdBy']) ||
      (typeof payload['updatedBy'] === 'string' && payload['updatedBy']) ||
      (typeof payload['publishedBy'] === 'string' && payload['publishedBy']) ||
      (typeof payload['unpublishedBy'] === 'string' && payload['unpublishedBy']) ||
      (typeof payload['deletedBy'] === 'string' && payload['deletedBy']) ||
      null;

    await this.prisma.timelineEvent.create({
      data: {
        workspaceId: event.workspaceId,
        actorUserId: actor,
        eventType: event.eventType,
        title,
        summary: JSON.stringify(payload).slice(0, 500),
        resourceType: 'Workflow',
        resourceId: typeof payload['workflowId'] === 'string' ? payload['workflowId'] : null,
        metadata: payload as Prisma.InputJsonValue,
        occurredAt: new Date(),
      },
    });
  }

  private async projectSearchAndCache(event: {
    eventType: string;
    payload: Prisma.JsonValue;
    workspaceId: string | null;
  }): Promise<void> {
    if (!event.workspaceId) {
      return;
    }
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const workflowId = typeof payload['workflowId'] === 'string' ? payload['workflowId'] : null;
    if (!workflowId) {
      return;
    }

    if (event.eventType === 'WorkflowDeleted') {
      await this.search.removeWorkflowDocument(event.workspaceId, workflowId);
      await this.workflowCache.invalidate(event.workspaceId, workflowId);
      return;
    }

    if (event.eventType === 'WorkflowUnpublished') {
      await this.workflowCache.invalidate(event.workspaceId, workflowId);
    }

    if (
      event.eventType === 'WorkflowCreated' ||
      event.eventType === 'WorkflowUpdated' ||
      event.eventType === 'WorkflowPublished'
    ) {
      const workflow = await this.prisma.workflow.findFirst({
        where: { id: workflowId, workspaceId: event.workspaceId },
        select: { name: true, description: true, status: true },
      });
      if (!workflow || !workflow.name) {
        return;
      }
      await this.search.upsertWorkflowDocument({
        workspaceId: event.workspaceId,
        workflowId,
        title: workflow.name,
        body: workflow.description ?? '',
        metadata: { status: workflow.status },
      });
    }
  }
}
