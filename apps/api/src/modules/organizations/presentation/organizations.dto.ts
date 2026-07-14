import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const createOrgSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(64).optional(),
});

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Corp', minLength: 1, maxLength: 255 })
  name!: string;

  @ApiPropertyOptional({ example: 'acme', minLength: 1, maxLength: 64 })
  slug?: string;
}

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Acme Corporation', minLength: 1, maxLength: 255 })
  name?: string;
}

export class OrganizationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ format: 'uuid' })
  ownerUserId!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
