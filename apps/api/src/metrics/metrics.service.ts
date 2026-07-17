import { Inject, Injectable } from '@nestjs/common';
import type { ApiConfig } from '@flowforge/config';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { APP_CONFIG } from '../config/config.constants';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  private readonly httpDuration: Histogram<string>;
  private readonly dbDuration: Histogram<string>;
  private readonly queueDepth: Gauge<string>;
  private readonly queueJobs: Counter<string>;
  private readonly rateLimitDecisions: Counter<string>;
  private readonly cleanupDeleted: Counter<string>;

  constructor(@Inject(APP_CONFIG) config: ApiConfig) {
    this.registry.setDefaultLabels({
      service: config.OTEL_SERVICE_NAME,
      env: config.NODE_ENV,
      app: config.APP_NAME,
      version: config.APP_VERSION,
    });

    collectDefaultMetrics({
      register: this.registry,
      prefix: 'flowforge_',
    });

    this.httpDuration = new Histogram({
      name: 'flowforge_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.dbDuration = new Histogram({
      name: 'flowforge_db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry],
    });

    this.queueDepth = new Gauge({
      name: 'flowforge_queue_depth',
      help: 'BullMQ queue depth by state',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
    });

    this.queueJobs = new Counter({
      name: 'flowforge_queue_jobs_total',
      help: 'BullMQ jobs by queue and result',
      labelNames: ['queue', 'result'],
      registers: [this.registry],
    });

    this.rateLimitDecisions = new Counter({
      name: 'flowforge_rate_limit_decisions_total',
      help: 'Rate-limit decisions by bucket type',
      labelNames: ['bucket', 'decision'],
      registers: [this.registry],
    });

    this.cleanupDeleted = new Counter({
      name: 'flowforge_cleanup_deleted_total',
      help: 'Rows deleted by cleanup jobs',
      labelNames: ['table'],
      registers: [this.registry],
    });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  recordHttp(method: string, route: string, statusCode: number, durationMs: number): void {
    this.httpDuration.observe(
      { method, route, status_code: String(statusCode) },
      durationMs / 1000,
    );
  }

  recordDbQuery(query: string, durationMs: number): void {
    const operation = query.trim().split(/\s+/)[0]?.toLowerCase() || 'unknown';
    this.dbDuration.observe({ operation }, durationMs / 1000);
  }

  recordQueueEnqueue(queue: string): void {
    this.queueJobs.inc({ queue, result: 'enqueued' });
  }

  recordQueueResult(
    queue: string,
    result: 'completed' | 'failed' | 'replayed' | 'discarded',
  ): void {
    this.queueJobs.inc({ queue, result });
  }

  setQueueDepth(queue: string, state: string, count: number): void {
    this.queueDepth.set({ queue, state }, count);
  }

  recordRateLimit(
    bucket: 'anonymous' | 'user' | 'api_key',
    decision: 'allow' | 'block' | 'fail_open',
  ): void {
    this.rateLimitDecisions.inc({ bucket, decision });
  }

  recordCleanup(table: 'outbox_events' | 'inbox_events' | 'idempotency_keys', count: number): void {
    if (count > 0) {
      this.cleanupDeleted.inc({ table }, count);
    }
  }
}
