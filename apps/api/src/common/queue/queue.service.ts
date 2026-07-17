import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { ApiConfig } from '@flowforge/config';
import {
  QUEUES,
  type ExecutionJobPayload,
  type WebhookOutboundJobPayload,
} from '@flowforge/contracts';
import { APP_CONFIG } from '../../config/config.constants';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly executionQueue: Queue<ExecutionJobPayload>;
  private readonly webhookOutboundQueue: Queue<WebhookOutboundJobPayload>;

  constructor(@Inject(APP_CONFIG) config: ApiConfig) {
    const connection = { url: config.REDIS_URL, maxRetriesPerRequest: null };
    this.executionQueue = new Queue<ExecutionJobPayload>(QUEUES.WORKFLOW_EXECUTION, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    });
    this.webhookOutboundQueue = new Queue<WebhookOutboundJobPayload>(QUEUES.WEBHOOK_OUTBOUND, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
  }

  async enqueueExecution(
    payload: ExecutionJobPayload,
    priority = false,
  ): Promise<string | undefined> {
    const job = await this.executionQueue.add('run', payload, {
      jobId: `exec-${payload.executionId}`,
      priority: priority ? 1 : undefined,
    });
    return job.id;
  }

  async enqueueWebhookOutbound(
    payload: WebhookOutboundJobPayload,
  ): Promise<string | undefined> {
    const job = await this.webhookOutboundQueue.add('deliver', payload, {
      jobId: `wh-out-${payload.deliveryId}`,
    });
    return job.id;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.executionQueue.close(), this.webhookOutboundQueue.close()]);
  }
}
