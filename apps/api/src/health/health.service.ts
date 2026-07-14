import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as Minio from 'minio';
import { APP_CONFIG } from '../config/config.constants';
import type { ApiConfig } from '@flowforge/config';
import type { HealthCheck } from '@flowforge/contracts';

type DependencyCheck = {
  status: 'up' | 'down';
  latencyMs?: number;
  message?: string;
};

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly startTime = Date.now();
  private redis: Redis | null = null;
  private minio: Minio.Client | null = null;
  private prisma: PrismaClient | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: ApiConfig) {}

  getLiveness(): HealthCheck {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: this.config.APP_VERSION,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: {},
    };
  }

  async getReadiness(): Promise<HealthCheck> {
    const checks: Record<string, DependencyCheck> = {};

    const [postgres, redis, minio] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkMinio(),
    ]);

    checks['postgres'] = postgres;
    checks['redis'] = redis;
    checks['minio'] = minio;

    const allUp = Object.values(checks).every((c) => c.status === 'up');
    const anyDown = Object.values(checks).some((c) => c.status === 'down');

    return {
      status: allUp ? 'ok' : anyDown ? 'error' : 'degraded',
      timestamp: new Date().toISOString(),
      version: this.config.APP_VERSION,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks,
    };
  }

  async getStartup(): Promise<HealthCheck> {
    return this.getReadiness();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.prisma) {
      await this.prisma.$disconnect();
      this.prisma = null;
    }
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }

  private async checkPostgres(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      if (!this.prisma) {
        this.prisma = new PrismaClient();
      }
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private async checkRedis(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      if (!this.redis) {
        this.redis = new Redis(this.config.REDIS_URL, {
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
          lazyConnect: true,
        });
        await this.redis.connect();
      }
      await this.redis.ping();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private async checkMinio(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      if (!this.minio) {
        this.minio = new Minio.Client({
          endPoint: this.config.MINIO_ENDPOINT,
          port: this.config.MINIO_PORT,
          useSSL: this.config.MINIO_USE_SSL,
          accessKey: this.config.MINIO_ACCESS_KEY,
          secretKey: this.config.MINIO_SECRET_KEY,
        });
      }
      await this.minio.listBuckets();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }
}
