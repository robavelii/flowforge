import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const startExecutionSchema = z.object({
  payload: z.record(z.string(), z.unknown()).optional(),
  sandbox: z.boolean().optional(),
  idempotencyKey: z.string().min(1).max(255).optional(),
});

export const testExecutionSchema = z.object({
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const listExecutionsQuerySchema = z.object({
  workflowId: z.string().uuid().optional(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export class StartExecutionDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  payload?: Record<string, unknown>;

  @ApiPropertyOptional()
  sandbox?: boolean;

  @ApiPropertyOptional()
  idempotencyKey?: string;
}

export class TestExecutionDto {
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  payload?: Record<string, unknown>;
}

export class ExecutionSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ format: 'uuid' })
  workflowId!: string;

  @ApiProperty({ format: 'uuid' })
  workflowVersionId!: string;

  @ApiProperty({ enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] })
  status!: string;

  @ApiProperty({ enum: ['manual', 'api', 'schedule', 'webhook', 'replay'] })
  triggerType!: string;

  @ApiProperty()
  sandbox!: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  errorCode!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  errorMessage!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  startedByUserId!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  startedAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  completedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
