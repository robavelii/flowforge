import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../config/config.constants';
import { PrismaService } from './prisma.service';

/**
 * Read-replica facade for history-heavy queries. Local/dev falls back to primary.
 */
@Injectable()
export class PrismaReadService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient | PrismaService;
  private readonly ownsClient: boolean;

  constructor(
    @Inject(APP_CONFIG) config: ApiConfig,
    primary: PrismaService,
  ) {
    if (config.DATABASE_REPLICA_URL) {
      this.client = new PrismaClient({
        datasources: { db: { url: config.DATABASE_REPLICA_URL } },
      });
      this.ownsClient = true;
    } else {
      this.client = primary;
      this.ownsClient = false;
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.ownsClient) {
      await this.client.$connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.ownsClient) {
      await this.client.$disconnect();
    }
  }
}
