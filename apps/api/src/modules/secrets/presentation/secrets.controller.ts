import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { SecretsService } from '../application/secrets.service';

export const createSecretSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'Secret name must be an identifier'),
  value: z.string().min(1).max(10_000),
  description: z.string().max(2000).optional(),
  secretType: z.enum(['generic', 'oauth_token', 'api_credential']).optional(),
});

export const rotateSecretSchema = z.object({
  value: z.string().min(1).max(10_000),
  expectedVersion: z.number().int().positive(),
});

export class CreateSecretDto {
  @ApiProperty({ example: 'stripe_api_key' })
  name!: string;

  @ApiProperty({ writeOnly: true })
  value!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional({ enum: ['generic', 'oauth_token', 'api_credential'] })
  secretType?: 'generic' | 'oauth_token' | 'api_credential';
}

export class RotateSecretDto {
  @ApiProperty({ writeOnly: true })
  value!: string;

  @ApiProperty({ example: 1 })
  expectedVersion!: number;
}

export class SecretResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty()
  secretType!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ example: '••••••••' })
  valueMasked!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

@ApiTags('Secrets')
@ApiBearerAuth('bearer')
@Controller('v1/secrets')
export class SecretsController {
  constructor(private readonly secrets: SecretsService) {}

  @Get()
  @RequirePermission('secret:read')
  @ApiOperation({ summary: 'List secrets (values never returned)' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ type: SecretResponseDto, isArray: true })
  list(@Tenant() tenant: TenantContextData) {
    return this.secrets.list(tenant.workspaceId);
  }

  @Post()
  @RequirePermission('secret:write')
  @ApiOperation({ summary: 'Create an encrypted secret' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiBody({ type: CreateSecretDto })
  @ApiCreatedResponse({ type: SecretResponseDto })
  create(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSecretSchema)) body: CreateSecretDto,
  ) {
    return this.secrets.create(tenant.workspaceId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission('secret:write')
  @ApiOperation({ summary: 'Rotate secret value (optimistic lock)' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: RotateSecretDto })
  @ApiOkResponse({ type: SecretResponseDto })
  rotate(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rotateSecretSchema)) body: RotateSecretDto,
  ) {
    return this.secrets.rotate(tenant.workspaceId, id, user.sub, body);
  }

  @Delete(':id')
  @RequirePermission('secret:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a secret' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  async remove(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.secrets.softDelete(tenant.workspaceId, id, user.sub);
  }
}
