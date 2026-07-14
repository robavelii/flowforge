import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().min(1).max(128),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  permissionKeys: z.array(z.string().min(1).max(128)).min(1),
});

export class CreateRoleDto {
  @ApiProperty({ example: 'Release Manager', minLength: 1, maxLength: 128 })
  name!: string;

  @ApiPropertyOptional({
    example: 'release-manager',
    minLength: 1,
    maxLength: 64,
    description: 'Derived from name when omitted',
  })
  slug?: string;

  @ApiProperty({
    type: [String],
    example: ['workflow:read', 'workflow:publish', 'execution:read'],
  })
  permissionKeys!: string[];
}

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  permissionKeys: z.array(z.string().min(1).max(128)).min(1),
});

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Release Manager', minLength: 1, maxLength: 128 })
  name?: string;

  @ApiProperty({
    type: [String],
    example: ['workflow:read', 'workflow:publish'],
  })
  permissionKeys!: string[];
}

export class PermissionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'workflow:read' })
  key!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class RolePermissionNestedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  permissionId!: string;

  @ApiProperty({ type: PermissionResponseDto })
  permission!: PermissionResponseDto;
}

export class RoleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  workspaceId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  isSystem!: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: RolePermissionNestedDto, isArray: true })
  rolePermissions!: RolePermissionNestedDto[];
}
