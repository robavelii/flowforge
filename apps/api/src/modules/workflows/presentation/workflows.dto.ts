import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { workflowGraphSchema } from '../domain/graph.schema';

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  graph: workflowGraphSchema.optional(),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  graph: workflowGraphSchema.optional(),
  expectedVersion: z.number().int().positive(),
});

export const publishWorkflowSchema = z.object({
  changelog: z.string().max(2000).optional(),
  expectedVersion: z.number().int().positive(),
});

export const unpublishWorkflowSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const rollbackWorkflowSchema = z.object({
  versionId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
});

export const duplicateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export class GraphNodeDto {
  @ApiProperty({ example: 'trigger_1' })
  key!: string;

  @ApiProperty({ example: 'trigger.manual' })
  typeKey!: string;

  @ApiProperty({ example: 'Manual start' })
  label!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  config!: Record<string, unknown>;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { x: 0, y: 0 },
  })
  position!: { x: number; y: number };
}

export class GraphConnectionDto {
  @ApiProperty()
  sourceKey!: string;

  @ApiProperty({ example: 'out' })
  sourcePort!: string;

  @ApiProperty()
  targetKey!: string;

  @ApiProperty({ example: 'in' })
  targetPort!: string;
}

export class GraphVariableDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  value!: string;

  @ApiPropertyOptional()
  description?: string;
}

export class WorkflowGraphDto {
  @ApiProperty({ type: [GraphNodeDto] })
  nodes!: GraphNodeDto[];

  @ApiProperty({ type: [GraphConnectionDto] })
  connections!: GraphConnectionDto[];

  @ApiProperty({ type: [GraphVariableDto] })
  variables!: GraphVariableDto[];
}

export class CreateWorkflowDto {
  @ApiProperty({ example: 'Onboard new customer' })
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional({ type: WorkflowGraphDto })
  graph?: WorkflowGraphDto;
}

export class UpdateWorkflowDto {
  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  description?: string | null;

  @ApiPropertyOptional({ type: WorkflowGraphDto })
  graph?: WorkflowGraphDto;

  @ApiProperty({ description: 'Optimistic lock version from last read', example: 1 })
  expectedVersion!: number;
}

export class PublishWorkflowDto {
  @ApiPropertyOptional()
  changelog?: string;

  @ApiProperty({ example: 2 })
  expectedVersion!: number;
}

export class UnpublishWorkflowDto {
  @ApiPropertyOptional()
  reason?: string;
}

export class RollbackWorkflowDto {
  @ApiProperty({ format: 'uuid' })
  versionId!: string;

  @ApiProperty({ example: 3 })
  expectedVersion!: number;
}

export class DuplicateWorkflowDto {
  @ApiPropertyOptional()
  name?: string;
}

export class WorkflowSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: ['draft', 'published', 'unpublished'] })
  status!: string;

  @ApiProperty()
  isTemplate!: boolean;

  @ApiProperty({ description: 'Optimistic lock version' })
  version!: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  publishedVersionId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdByUserId!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class WorkflowDetailDto extends WorkflowSummaryDto {
  @ApiProperty({ type: WorkflowGraphDto })
  graph!: WorkflowGraphDto;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  draftSavedAt!: string | null;
}

export class WorkflowVersionSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workflowId!: string;

  @ApiProperty()
  versionNumber!: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  changelog!: string | null;

  @ApiProperty()
  snapshotHash!: string;

  @ApiProperty({ format: 'uuid' })
  publishedById!: string;

  @ApiProperty({ format: 'date-time' })
  publishedAt!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class SearchHitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  entityType!: string;

  @ApiProperty({ format: 'uuid' })
  entityId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiPropertyOptional()
  metadata?: unknown;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
