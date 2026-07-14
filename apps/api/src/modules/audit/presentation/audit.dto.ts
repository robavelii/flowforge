import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const listAuditLogsSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().min(1).max(128).optional(),
});

export class ListAuditLogsQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Cursor for next page' })
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  limit?: number;

  @ApiPropertyOptional({ example: 'role.created', description: 'Filter by action' })
  action?: string;
}

export class AuditLogResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  workspaceId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  actorApiKeyId!: string | null;

  @ApiProperty({ example: 'role.created' })
  action!: string;

  @ApiProperty({ example: 'Role' })
  resourceType!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  resourceId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  before!: unknown;

  @ApiPropertyOptional({ nullable: true })
  after!: unknown;

  @ApiPropertyOptional({ type: String, nullable: true })
  ip!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  userAgent!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  correlationId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  reason!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class CursorPageMetaDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  nextCursor!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  prevCursor!: string | null;

  @ApiProperty()
  hasMore!: boolean;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: AuditLogResponseDto, isArray: true })
  data!: AuditLogResponseDto[];

  @ApiProperty({ type: CursorPageMetaDto })
  meta!: CursorPageMetaDto;
}
