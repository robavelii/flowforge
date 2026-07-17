import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../persistence/prisma.service';

@Injectable()
export class PlatformMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(workspaceId: string) {
    const [
      executionsQueued,
      executionsRunning,
      executionsFailed,
      unpublishedOutbox,
      workflowsActive,
      filesCount,
    ] = await Promise.all([
      this.prisma.workflowExecution.count({
        where: { workspaceId, status: 'queued' },
      }),
      this.prisma.workflowExecution.count({
        where: { workspaceId, status: 'running' },
      }),
      this.prisma.workflowExecution.count({
        where: { workspaceId, status: 'failed' },
      }),
      this.prisma.outboxEvent.count({
        where: { workspaceId, publishedAt: null },
      }),
      this.prisma.workflow.count({
        where: { workspaceId, deletedAt: null, status: { not: 'archived' } },
      }),
      this.prisma.fileObject.count({
        where: { workspaceId, deletedAt: null },
      }),
    ]);

    return {
      workspaceId,
      executions: {
        queued: executionsQueued,
        running: executionsRunning,
        failed: executionsFailed,
      },
      outboxUnpublished: unpublishedOutbox,
      workflowsActive,
      filesCount,
      generatedAt: new Date().toISOString(),
    };
  }
}
