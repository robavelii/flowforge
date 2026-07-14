import { Worker, Queue } from 'bullmq';
import pino, { type LoggerOptions } from 'pino';
import { loadWorkerConfig } from '@flowforge/config';

const QUEUE_NAME = 'flowforge-default';

function createLogger(level: string, nodeEnv: string): pino.Logger {
  const options: LoggerOptions = { level };

  if (nodeEnv === 'development') {
    options.transport = { target: 'pino-pretty', options: { colorize: true } };
  }

  return pino(options);
}

function main(): void {
  const config = loadWorkerConfig();
  const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV);

  logger.info({ service: config.OTEL_SERVICE_NAME }, 'Starting FlowForge worker');

  const connection = {
    url: config.REDIS_URL,
    maxRetriesPerRequest: null,
  };

  const queue = new Queue(QUEUE_NAME, { connection });

  const worker = new Worker(
    QUEUE_NAME,
    (job) => {
      logger.info({ jobId: job.id, jobName: job.name }, 'Processing job');
      return Promise.resolve({ processed: true, timestamp: new Date().toISOString() });
    },
    {
      connection,
      concurrency: config.WORKER_CONCURRENCY,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Job failed');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Graceful shutdown initiated');
    await worker.close();
    await queue.close();
    logger.info('Worker shut down cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.info({ queue: QUEUE_NAME, concurrency: config.WORKER_CONCURRENCY }, 'Worker ready');
}

try {
  main();
} catch (err: unknown) {
  console.error('Failed to start FlowForge worker:', err);
  process.exit(1);
}
