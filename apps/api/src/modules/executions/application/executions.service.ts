import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExecutionStatus,
  ExecutionTriggerType,
  Prisma,
  WorkflowStatus,
} from '@prisma/client';
import { runExecution } from '@flowforge/execution-engine';
import { PrismaReadService } from '../../../persistence/prisma-read.service';
import { PrismaService } from '../../../persistence/prisma.service';
import { OutboxService } from '../../../common/outbox/outbox.service';
import { QueueService } from '../../../common/queue/queue.service';
import { QuotaService } from '../../../common/quota/quota.service';
import { AuditService } from '../../audit/application/audit.service';

@Injectable()
export class ExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly read: PrismaReadService,
    private readonly queue: QueueService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly quotas: QuotaService,
  ) {}

  async list(workspaceId: string, opts: { workflowId?: string; status?: string; limit: number; cursor?: string }) {
    const items = await this.read.client.workflowExecution.findMany({
      where: {
        workspaceId,
        ...(opts.workflowId ? { workflowId: opts.workflowId } : {}),
        ...(opts.status ? { status: opts.status as ExecutionStatus } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > opts.limit;
    const data = hasMore ? items.slice(0, opts.limit) : items;
    return {
      data: data.map((e) => this.toSummary(e)),
      meta: {
        nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null,
        prevCursor: null,
        hasMore,
      },
    };
  }

  async get(workspaceId: string, executionId: string) {
    const execution = await this.requireExecution(workspaceId, executionId);
    const steps = await this.prisma.executionStep.findMany({
      where: { executionId },
      orderBy: [{ sequenceNumber: 'asc' }, { attemptNumber: 'asc' }],
    });
    return { ...this.toSummary(execution), steps };
  }

  async getLogs(workspaceId: string, executionId: string) {
    await this.requireExecution(workspaceId, executionId);
    return this.prisma.executionLog.findMany({
      where: { executionId },
      orderBy: { loggedAt: 'asc' },
    });
  }

  async startManual(
    workspaceId: string,
    userId: string,
    workflowId: string,
    input: { payload?: Record<string, unknown>; sandbox?: boolean; idempotencyKey?: string },
  ) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId, deletedAt: null },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    if (workflow.status !== WorkflowStatus.published || !workflow.publishedVersionId) {
      throw new BadRequestException('Workflow must be published to execute');
    }

    return this.createAndEnqueue({
      workspaceId,
      userId,
      workflowId,
      workflowVersionId: workflow.publishedVersionId,
      triggerType: ExecutionTriggerType.manual,
      payload: input.payload ?? {},
      sandbox: input.sandbox ?? false,
      idempotencyKey: input.idempotencyKey,
      priority: true,
    });
  }

  async startTest(
    workspaceId: string,
    userId: string,
    workflowId: string,
    input: { payload?: Record<string, unknown> },
  ) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId, deletedAt: null },
      include: { draft: true, publishedVersion: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    // Prefer published version; fall back requires a temporary version from draft for sandbox
    const versionId = workflow.publishedVersionId;
    if (!versionId) {
      throw new BadRequestException('Publish the workflow before running a test, or publish a draft first');
    }

    return this.createAndEnqueue({
      workspaceId,
      userId,
      workflowId,
      workflowVersionId: versionId,
      triggerType: ExecutionTriggerType.manual,
      payload: input.payload ?? { mode: 'test' },
      sandbox: true,
      priority: true,
    });
  }

  async cancel(workspaceId: string, executionId: string, userId: string) {
    const execution = await this.requireExecution(workspaceId, executionId);
    if (
      execution.status !== ExecutionStatus.queued &&
      execution.status !== ExecutionStatus.running
    ) {
      throw new BadRequestException(`Cannot cancel execution in status ${execution.status}`);
    }

    const updated = await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: ExecutionStatus.cancelled,
        completedAt: new Date(),
        errorMessage: 'Cancelled by user',
        version: { increment: 1 },
      },
    });

    await this.audit.write({
      workspaceId,
      actorUserId: userId,
      action: 'execution.cancelled',
      resourceType: 'WorkflowExecution',
      resourceId: executionId,
    });

    return this.toSummary(updated);
  }

  async replay(workspaceId: string, executionId: string, userId: string) {
    const source = await this.requireExecution(workspaceId, executionId);
    if (source.status !== ExecutionStatus.failed && source.status !== ExecutionStatus.cancelled) {
      throw new BadRequestException('Only failed or cancelled executions can be replayed');
    }

    return this.createAndEnqueue({
      workspaceId,
      userId,
      workflowId: source.workflowId,
      workflowVersionId: source.workflowVersionId,
      triggerType: ExecutionTriggerType.replay,
      payload: (source.triggerPayload as Record<string, unknown>) ?? {},
      sandbox: source.sandbox,
      replayOfId: source.id,
      priority: true,
    });
  }

  /** Used by scheduler / internal callers */
  async startFromSchedule(params: {
    workspaceId: string;
    workflowId: string;
    workflowVersionId: string;
    scheduleId: string;
  }) {
    return this.createAndEnqueue({
      workspaceId: params.workspaceId,
      userId: null,
      workflowId: params.workflowId,
      workflowVersionId: params.workflowVersionId,
      triggerType: ExecutionTriggerType.schedule,
      payload: { scheduleId: params.scheduleId },
      sandbox: false,
    });
  }

  async startFromWebhook(params: {
    workspaceId: string;
    workflowId: string;
    workflowVersionId: string;
    payload: Record<string, unknown>;
  }) {
    return this.createAndEnqueue({
      workspaceId: params.workspaceId,
      userId: null,
      workflowId: params.workflowId,
      workflowVersionId: params.workflowVersionId,
      triggerType: ExecutionTriggerType.webhook,
      payload: params.payload,
      sandbox: false,
      priority: true,
    });
  }

  private async createAndEnqueue(params: {
    workspaceId: string;
    userId: string | null;
    workflowId: string;
    workflowVersionId: string;
    triggerType: ExecutionTriggerType;
    payload: Record<string, unknown>;
    sandbox: boolean;
    idempotencyKey?: string;
    replayOfId?: string;
    priority?: boolean;
  }) {
    if (params.idempotencyKey) {
      const existing = await this.prisma.workflowExecution.findFirst({
        where: {
          workspaceId: params.workspaceId,
          idempotencyKey: params.idempotencyKey,
        },
      });
      if (existing) {
        return this.toSummary(existing);
      }
    }

    await this.quotas.consumeExecution(params.workspaceId, { sandbox: params.sandbox });

    const execution = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workflowExecution.create({
        data: {
          workspaceId: params.workspaceId,
          workflowId: params.workflowId,
          workflowVersionId: params.workflowVersionId,
          status: ExecutionStatus.queued,
          triggerType: params.triggerType,
          triggerPayload: params.payload as Prisma.InputJsonValue,
          sandbox: params.sandbox,
          startedByUserId: params.userId,
          idempotencyKey: params.idempotencyKey,
          replayOfId: params.replayOfId,
        },
      });

      await this.outbox.append(
        {
          workspaceId: params.workspaceId,
          aggregateType: 'WorkflowExecution',
          aggregateId: created.id,
          eventType: 'ExecutionQueued',
          payload: {
            executionId: created.id,
            workflowId: params.workflowId,
            triggerType: params.triggerType,
            sandbox: params.sandbox,
            createdBy: params.userId,
          },
        },
        tx,
      );

      return created;
    });

    if (process.env['NODE_ENV'] !== 'test') {
      await this.queue.enqueueExecution(
        {
          executionId: execution.id,
          workspaceId: params.workspaceId,
          workflowId: params.workflowId,
          workflowVersionId: params.workflowVersionId,
          sandbox: params.sandbox,
        },
        params.priority ?? false,
      );
    }

    // In test, run inline so e2e doesn't need a separate worker process
    if (process.env['NODE_ENV'] === 'test') {
      await runExecution({
        prisma: this.prisma,
        executionId: execution.id,
        shouldCancel: async () => {
          const row = await this.prisma.workflowExecution.findUnique({
            where: { id: execution.id },
            select: { status: true },
          });
          return row?.status === ExecutionStatus.cancelled;
        },
      });
      const refreshed = await this.prisma.workflowExecution.findUniqueOrThrow({
        where: { id: execution.id },
      });
      await this.emitExecutionFinished(refreshed);
      return this.toSummary(refreshed);
    }

    return this.toSummary(execution);
  }

  private async emitExecutionFinished(execution: {
    id: string;
    workspaceId: string;
    workflowId: string;
    status: ExecutionStatus;
    errorMessage: string | null;
    startedByUserId: string | null;
  }): Promise<void> {
    if (
      execution.status !== ExecutionStatus.completed &&
      execution.status !== ExecutionStatus.failed
    ) {
      return;
    }

    const eventType =
      execution.status === ExecutionStatus.failed ? 'ExecutionFailed' : 'ExecutionCompleted';

    await this.outbox.append({
      workspaceId: execution.workspaceId,
      aggregateType: 'WorkflowExecution',
      aggregateId: execution.id,
      eventType,
      payload: {
        executionId: execution.id,
        workflowId: execution.workflowId,
        workspaceId: execution.workspaceId,
        errorMessage: execution.errorMessage,
        startedByUserId: execution.startedByUserId,
      },
    });
  }

  private async requireExecution(workspaceId: string, executionId: string) {
    const execution = await this.prisma.workflowExecution.findFirst({
      where: { id: executionId, workspaceId },
    });
    if (!execution) {
      throw new NotFoundException('Execution not found');
    }
    return execution;
  }

  private toSummary(execution: {
    id: string;
    workspaceId: string;
    workflowId: string;
    workflowVersionId: string;
    status: ExecutionStatus;
    triggerType: ExecutionTriggerType;
    sandbox: boolean;
    errorCode: string | null;
    errorMessage: string | null;
    startedByUserId: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: execution.id,
      workspaceId: execution.workspaceId,
      workflowId: execution.workflowId,
      workflowVersionId: execution.workflowVersionId,
      status: execution.status,
      triggerType: execution.triggerType,
      sandbox: execution.sandbox,
      errorCode: execution.errorCode,
      errorMessage: execution.errorMessage,
      startedByUserId: execution.startedByUserId,
      startedAt: execution.startedAt?.toISOString() ?? null,
      completedAt: execution.completedAt?.toISOString() ?? null,
      createdAt: execution.createdAt.toISOString(),
      updatedAt: execution.updatedAt.toISOString(),
    };
  }
}
