import { Worker, Queue } from 'bullmq';
import { PrismaClient, ScheduleStatus } from '@prisma/client';
import Redis from 'ioredis';
import pino, { type LoggerOptions } from 'pino';
import { CronExpressionParser } from 'cron-parser';
import { loadWorkerConfig } from '@flowforge/config';
import { QUEUES, type ExecutionJobPayload, type WebhookOutboundJobPayload } from '@flowforge/contracts';
import { runExecution } from '@flowforge/execution-engine';
import { deliverOutboundWebhookJob } from './webhook-outbound.js';

function createLogger(level: string, nodeEnv: string): pino.Logger {
  const options: LoggerOptions = { level };
  if (nodeEnv === 'development') {
    options.transport = { target: 'pino-pretty', options: { colorize: true } };
  }
  return pino(options);
}

async function withLock(
  redis: Redis,
  key: string,
  ttlMs: number,
  fn: () => Promise<void>,
): Promise<boolean> {
  const token = `${process.pid}-${Date.now()}`;
  const ok = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (ok !== 'OK') {
    return false;
  }
  try {
    await fn();
    return true;
  } finally {
    const current = await redis.get(key);
    if (current === token) {
      await redis.del(key);
    }
  }
}

async function tickScheduler(
  prisma: PrismaClient,
  executionQueue: Queue<ExecutionJobPayload>,
  redis: Redis,
  logger: pino.Logger,
): Promise<void> {
  await withLock(redis, 'lock:scheduler:tick', 25_000, async () => {
    const due = await prisma.schedule.findMany({
      where: {
        status: ScheduleStatus.active,
        nextRunAt: { lte: new Date() },
      },
      take: 50,
    });

    for (const schedule of due) {
      const execution = await prisma.workflowExecution.create({
        data: {
          workspaceId: schedule.workspaceId,
          workflowId: schedule.workflowId,
          workflowVersionId: schedule.workflowVersionId,
          triggerType: 'schedule',
          triggerPayload: { scheduleId: schedule.id },
          status: 'queued',
          sandbox: false,
        },
      });

      await executionQueue.add(
        'run',
        {
          executionId: execution.id,
          workspaceId: schedule.workspaceId,
          workflowId: schedule.workflowId,
          workflowVersionId: schedule.workflowVersionId,
          sandbox: false,
        },
        { jobId: `exec-${execution.id}` },
      );

      let nextRunAt: Date | null = null;
      try {
        const interval = CronExpressionParser.parse(schedule.cronExpression, {
          tz: schedule.timezone,
          currentDate: new Date(),
        });
        nextRunAt = interval.next().toDate();
      } catch (err) {
        logger.error({ err, scheduleId: schedule.id }, 'Failed to compute next cron run');
      }

      await prisma.schedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt,
        },
      });

      logger.info(
        { scheduleId: schedule.id, executionId: execution.id },
        'Schedule fired execution',
      );
    }
  });
}

function main(): void {
  const config = loadWorkerConfig();
  const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV);
  const prisma = new PrismaClient();
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });

  logger.info({ service: config.OTEL_SERVICE_NAME }, 'Starting FlowForge worker');

  const connection = {
    url: config.REDIS_URL,
    maxRetriesPerRequest: null,
  };

  const executionQueue = new Queue<ExecutionJobPayload>(QUEUES.WORKFLOW_EXECUTION, {
    connection,
  });
  const webhookOutboundQueue = new Queue<WebhookOutboundJobPayload>(QUEUES.WEBHOOK_OUTBOUND, {
    connection,
  });

  const inflight = new Set<string>();

  const worker = new Worker<ExecutionJobPayload>(
    QUEUES.WORKFLOW_EXECUTION,
    async (job) => {
      const { executionId } = job.data;
      inflight.add(executionId);
      try {
        logger.info({ executionId, jobId: job.id }, 'Running workflow execution');
        const status = await runExecution({
          prisma,
          executionId,
          shouldCancel: async () => {
            const row = await prisma.workflowExecution.findUnique({
              where: { id: executionId },
              select: { status: true },
            });
            return row?.status === 'cancelled';
          },
          onCheckpoint: async (checkpoint) => {
            logger.debug({ executionId, checkpoint }, 'Execution checkpoint');
          },
        });
        logger.info({ executionId, status }, 'Execution finished');
        return { status };
      } finally {
        inflight.delete(executionId);
      }
    },
    {
      connection,
      concurrency: config.WORKER_CONCURRENCY,
    },
  );

  const webhookWorker = new Worker<WebhookOutboundJobPayload>(
    QUEUES.WEBHOOK_OUTBOUND,
    async (job) => {
      logger.info({ deliveryId: job.data.deliveryId, jobId: job.id }, 'Delivering outbound webhook');
      await deliverOutboundWebhookJob({
        prisma,
        deliveryId: job.data.deliveryId,
        encryptionKey: config.SECRETS_ENCRYPTION_KEY,
      });
    },
    {
      connection,
      concurrency: Math.max(1, Math.floor(config.WORKER_CONCURRENCY / 2)),
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Execution job failed');
  });
  webhookWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Webhook delivery job failed');
  });

  let schedulerTimer: NodeJS.Timeout | null = setInterval(() => {
    void tickScheduler(prisma, executionQueue, redis, logger).catch((err: unknown) => {
      logger.error({ err }, 'Scheduler tick failed');
    });
  }, 15_000);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal, inflight: [...inflight] }, 'Graceful shutdown initiated');
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
    await Promise.all([worker.close(), webhookWorker.close()]);
    const deadline = Date.now() + 25_000;
    while (inflight.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    await Promise.all([executionQueue.close(), webhookOutboundQueue.close()]);
    await redis.quit();
    await prisma.$disconnect();
    logger.info('Worker shut down cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  void redis.connect().then(() => {
    logger.info(
      { queue: QUEUES.WORKFLOW_EXECUTION, concurrency: config.WORKER_CONCURRENCY },
      'Worker ready',
    );
  });
}

try {
  main();
} catch (err: unknown) {
  console.error('Failed to start FlowForge worker:', err);
  process.exit(1);
}
