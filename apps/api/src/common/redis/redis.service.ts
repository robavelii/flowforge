import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import type { ApiConfig } from '@flowforge/config';
import { APP_CONFIG } from '../../config/config.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(@Inject(APP_CONFIG) config: ApiConfig) {
    this.client = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
  }

  async connect(): Promise<void> {
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit();
    }
  }
}
