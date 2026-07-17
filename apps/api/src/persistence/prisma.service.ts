import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly metrics: MetricsService) {
    super({
      log: [{ emit: 'event', level: 'query' }],
    });
  }

  async onModuleInit(): Promise<void> {
    const queryEmitter = this as unknown as {
      $on(event: 'query', cb: (event: { query: string; duration: number }) => void): void;
    };
    queryEmitter.$on('query', (event) => {
      this.metrics.recordDbQuery(event.query, event.duration);
    });
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
