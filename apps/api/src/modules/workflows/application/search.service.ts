import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma.service';

type SearchHit = {
  id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  body: string;
  metadata: Prisma.JsonValue;
  updated_at: Date;
  highlight: string | null;
  rank: number;
};

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertDocument(params: {
    workspaceId: string;
    entityType: string;
    entityId: string;
    title: string;
    body: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.searchDocument.upsert({
      where: {
        workspaceId_entityType_entityId: {
          workspaceId: params.workspaceId,
          entityType: params.entityType,
          entityId: params.entityId,
        },
      },
      create: {
        workspaceId: params.workspaceId,
        entityType: params.entityType,
        entityId: params.entityId,
        title: params.title,
        body: params.body,
        metadata: params.metadata,
      },
      update: {
        title: params.title,
        body: params.body,
        metadata: params.metadata,
      },
    });
  }

  async upsertWorkflowDocument(params: {
    workspaceId: string;
    workflowId: string;
    title: string;
    body: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.upsertDocument({
      workspaceId: params.workspaceId,
      entityType: 'workflow',
      entityId: params.workflowId,
      title: params.title,
      body: params.body,
      metadata: params.metadata,
    });
  }

  async removeDocument(workspaceId: string, entityType: string, entityId: string): Promise<void> {
    await this.prisma.searchDocument.deleteMany({
      where: { workspaceId, entityType, entityId },
    });
  }

  async removeWorkflowDocument(workspaceId: string, workflowId: string): Promise<void> {
    await this.removeDocument(workspaceId, 'workflow', workflowId);
  }

  async search(workspaceId: string, query: string, opts?: { limit?: number; entityType?: string }) {
    const q = query.trim();
    const limit = Math.min(opts?.limit ?? 20, 50);
    if (!q) {
      return { data: [], meta: { query: q, limit, mode: 'fts' as const } };
    }

    const entityFilter = opts?.entityType
      ? Prisma.sql`AND entity_type = ${opts.entityType}`
      : Prisma.empty;

    let rows: SearchHit[];
    try {
      rows = await this.prisma.$queryRaw<SearchHit[]>`
        SELECT
          id,
          entity_type,
          entity_id,
          title,
          body,
          metadata,
          updated_at,
          ts_headline(
            'english',
            body,
            plainto_tsquery('english', ${q}),
            'MaxWords=20, MinWords=10'
          ) AS highlight,
          ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
        FROM search_documents
        WHERE workspace_id = ${workspaceId}::uuid
          AND search_vector @@ plainto_tsquery('english', ${q})
          ${entityFilter}
        ORDER BY rank DESC, updated_at DESC
        LIMIT ${limit}
      `;
    } catch {
      // Fallback if FTS column missing (e.g. mid-migration)
      const data = await this.prisma.searchDocument.findMany({
        where: {
          workspaceId,
          ...(opts?.entityType ? { entityType: opts.entityType } : {}),
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { body: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      return {
        data: data.map((d) => ({
          id: d.id,
          entityType: d.entityType,
          entityId: d.entityId,
          title: d.title,
          body: d.body,
          highlight: null as string | null,
          metadata: d.metadata,
          updatedAt: d.updatedAt.toISOString(),
        })),
        meta: { query: q, limit, mode: 'ilike' as const },
      };
    }

    return {
      data: rows.map((d) => ({
        id: d.id,
        entityType: d.entity_type,
        entityId: d.entity_id,
        title: d.title,
        body: d.body,
        highlight: d.highlight,
        metadata: d.metadata,
        updatedAt: d.updated_at.toISOString(),
      })),
      meta: { query: q, limit, mode: 'fts' as const },
    };
  }
}
