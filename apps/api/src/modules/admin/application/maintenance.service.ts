import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../../../config/config.constants';
import { MetricsService } from '../../../metrics/metrics.service';
import { PrismaService } from '../../../persistence/prisma.service';

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    @Inject(APP_CONFIG) private readonly config: ApiConfig,
  ) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    this.timer = setInterval(
      () => {
        void this.cleanup().catch((err: unknown) => {
          this.logger.error({ err }, 'Cleanup job failed');
        });
      },
      60 * 60 * 1000,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async cleanup(workspaceId?: string) {
    const cutoff = new Date(Date.now() - this.config.CLEANUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const [outbox, inbox, idempotency] = await this.prisma.$transaction([
      this.prisma.outboxEvent.deleteMany({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          publishedAt: { not: null, lt: cutoff },
        },
      }),
      this.prisma.inboxEvent.deleteMany({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          processedAt: { lt: cutoff },
        },
      }),
      this.prisma.idempotencyRecord.deleteMany({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          expiresAt: { lt: new Date() },
        },
      }),
    ]);

    this.metrics.recordCleanup('outbox_events', outbox.count);
    this.metrics.recordCleanup('inbox_events', inbox.count);
    this.metrics.recordCleanup('idempotency_keys', idempotency.count);

    return {
      cutoff: cutoff.toISOString(),
      deleted: {
        outboxEvents: outbox.count,
        inboxEvents: inbox.count,
        idempotencyKeys: idempotency.count,
      },
    };
  }
}
