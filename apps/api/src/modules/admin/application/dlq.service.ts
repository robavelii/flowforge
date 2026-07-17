import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { QUEUES } from '@flowforge/contracts';
import { PrismaService } from '../../../persistence/prisma.service';
import { QueueService } from '../../../common/queue/queue.service';
import { MetricsService } from '../../../metrics/metrics.service';

const MANAGED_QUEUES = new Set<string>([
  QUEUES.WORKFLOW_EXECUTION,
  QUEUES.WEBHOOK_OUTBOUND,
  QUEUES.NOTIFICATION_SEND,
]);

@Injectable()
export class DlqService {
  constructor(
    private readonly queues: QueueService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async list(workspaceId: string, queueName?: string, limit = 50) {
    const queues = this.resolveQueues(queueName);
    const data = [];

    for (const entry of queues) {
      const counts = await entry.queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
      );
      for (const [state, count] of Object.entries(counts)) {
        this.metrics.setQueueDepth(entry.name, state, count ?? 0);
      }

      const failed = await entry.queue.getJobs(['failed'], 0, Math.min(limit, 100) - 1, false);
      for (const job of failed) {
        if (await this.jobBelongsToWorkspace(job, workspaceId)) {
          data.push(this.toDto(entry.name, job));
        }
      }
    }

    return { data, meta: { workspaceId, count: data.length } };
  }

  async replay(workspaceId: string, queueName: string, jobId: string) {
    const queue = this.resolveQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job || !(await this.jobBelongsToWorkspace(job, workspaceId))) {
      throw new NotFoundException('DLQ job not found');
    }
    await job.retry();
    this.metrics.recordQueueResult(queueName, 'replayed');
    return { queue: queueName, jobId, status: 'replayed' };
  }

  async discard(workspaceId: string, queueName: string, jobId: string) {
    const queue = this.resolveQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job || !(await this.jobBelongsToWorkspace(job, workspaceId))) {
      throw new NotFoundException('DLQ job not found');
    }
    await job.remove();
    this.metrics.recordQueueResult(queueName, 'discarded');
  }

  private resolveQueues(queueName?: string): Array<{ name: string; queue: Queue }> {
    if (queueName) {
      return [{ name: queueName, queue: this.resolveQueue(queueName) }];
    }
    return this.queues.queues();
  }

  private resolveQueue(queueName: string): Queue {
    if (!MANAGED_QUEUES.has(queueName)) {
      throw new BadRequestException('Unsupported queue');
    }
    const entry = this.queues.queues().find((q) => q.name === queueName);
    if (!entry) {
      throw new BadRequestException('Unsupported queue');
    }
    return entry.queue;
  }

  private async jobBelongsToWorkspace(job: Job, workspaceId: string): Promise<boolean> {
    const data = job.data as Record<string, unknown>;
    if (typeof data['workspaceId'] === 'string') {
      return data['workspaceId'] === workspaceId;
    }
    if (typeof data['notificationId'] === 'string') {
      const notification = await this.prisma.notification.findUnique({
        where: { id: data['notificationId'] },
        select: { workspaceId: true },
      });
      return notification?.workspaceId === workspaceId;
    }
    return false;
  }

  private toDto(queue: string, job: Job) {
    return {
      queue,
      jobId: job.id,
      name: job.name,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason ?? null,
      timestamp: new Date(job.timestamp).toISOString(),
      data: job.data,
    };
  }
}
