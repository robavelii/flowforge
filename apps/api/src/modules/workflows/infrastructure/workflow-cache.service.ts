import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import type { WorkflowGraph } from '../domain/graph.schema';

export type PublishedWorkflowCache = {
  workflowId: string;
  versionId: string;
  versionNumber: number;
  graph: WorkflowGraph;
  snapshotHash: string;
  publishedAt: string;
};

@Injectable()
export class WorkflowCacheService {
  private readonly ttlSeconds = 300;

  constructor(private readonly redis: RedisService) {}

  private key(workspaceId: string, workflowId: string): string {
    return `wf:published:${workspaceId}:${workflowId}`;
  }

  async getPublished(
    workspaceId: string,
    workflowId: string,
  ): Promise<PublishedWorkflowCache | null> {
    await this.redis.connect();
    const raw = await this.redis.client.get(this.key(workspaceId, workflowId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PublishedWorkflowCache;
  }

  async setPublished(
    workspaceId: string,
    workflowId: string,
    value: PublishedWorkflowCache,
  ): Promise<void> {
    await this.redis.connect();
    await this.redis.client.set(
      this.key(workspaceId, workflowId),
      JSON.stringify(value),
      'EX',
      this.ttlSeconds,
    );
  }

  async invalidate(workspaceId: string, workflowId: string): Promise<void> {
    await this.redis.connect();
    await this.redis.client.del(this.key(workspaceId, workflowId));
  }
}
