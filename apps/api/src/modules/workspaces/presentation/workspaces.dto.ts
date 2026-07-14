import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(64).optional(),
  description: z.string().max(2000).optional(),
});

export class CreateWorkspaceDto {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ example: 'Default Workspace', minLength: 1, maxLength: 255 })
  name!: string;

  @ApiPropertyOptional({ example: 'default', minLength: 1, maxLength: 64 })
  slug?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  description?: string;
}

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 255 })
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  description?: string | null;
}

export class WorkspaceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ['active', 'suspended'] })
  status!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
