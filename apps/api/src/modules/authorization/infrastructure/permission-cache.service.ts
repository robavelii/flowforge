import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

const TTL_SECONDS = 60;

@Injectable()
export class PermissionCacheService {
  constructor(private readonly redis: RedisService) {}

  private key(workspaceId: string, actorId: string): string {
    return `perm:${workspaceId}:${actorId}`;
  }

  async get(workspaceId: string, actorId: string): Promise<string[] | null> {
    try {
      const raw = await this.redis.client.get(this.key(workspaceId, actorId));
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as string[];
    } catch {
      return null;
    }
  }

  async set(workspaceId: string, actorId: string, permissions: string[]): Promise<void> {
    try {
      await this.redis.client.set(
        this.key(workspaceId, actorId),
        JSON.stringify(permissions),
        'EX',
        TTL_SECONDS,
      );
    } catch {
      // degrade gracefully
    }
  }

  async invalidate(workspaceId: string, actorId?: string): Promise<void> {
    try {
      if (actorId) {
        await this.redis.client.del(this.key(workspaceId, actorId));
        return;
      }
      const stream = this.redis.client.scanStream({
        match: `perm:${workspaceId}:*`,
        count: 100,
      });
      for await (const keys of stream) {
        const batch = keys as string[];
        if (batch.length > 0) {
          await this.redis.client.del(...batch);
        }
      }
    } catch {
      // degrade gracefully
    }
  }
}
