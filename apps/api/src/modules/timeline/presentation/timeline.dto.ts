import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const listTimelineSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export class ListTimelineQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Cursor for next page' })
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  limit?: number;
}

export class TimelineEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ApiProperty({ example: 'MemberAdded' })
  eventType!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  summary!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  resourceType!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  resourceId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  metadata!: unknown;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

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

export class TimelineListResponseDto {
  @ApiProperty({ type: TimelineEventResponseDto, isArray: true })
  data!: TimelineEventResponseDto[];

  @ApiProperty({ type: CursorPageMetaDto })
  meta!: CursorPageMetaDto;
}
