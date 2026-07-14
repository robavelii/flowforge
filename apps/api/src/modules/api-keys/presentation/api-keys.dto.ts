import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string().min(1).max(128)).min(1),
  expiresAt: z.string().datetime().optional(),
});

export class CreateApiKeyDto {
  @ApiProperty({ example: 'CI pipeline', minLength: 1, maxLength: 255 })
  name!: string;

  @ApiProperty({
    type: [String],
    example: ['workflow:read', 'workflow:execute', 'execution:read'],
  })
  scopes!: string[];

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Optional expiry instant (ISO-8601)',
  })
  expiresAt?: string;
}

export class ApiKeyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: 'ff_live_abcd1234', description: 'Masked key prefix for identification' })
  keyPrefix!: string;

  @ApiProperty({ type: [String] })
  scopes!: string[];

  @ApiProperty({ enum: ['active', 'revoked', 'expired'] })
  status!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  revokedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ format: 'uuid' })
  createdByUserId!: string;
}

export class ApiKeyCreatedResponseDto extends ApiKeyResponseDto {
  @ApiProperty({
    example: 'ff_live_…',
    description: 'Raw secret returned once; store securely and never log',
  })
  key!: string;
}
