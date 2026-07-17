import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { FeatureFlagsService } from '../application/feature-flags.service';

export const upsertFlagSchema = z.object({
  enabled: z.boolean(),
  description: z.string().max(1000).optional(),
  metadata: z.unknown().optional(),
});

export const evaluateQuerySchema = z.object({
  key: z.string().min(1).max(128),
  default: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export class UpsertFeatureFlagDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  metadata?: unknown;
}

@ApiTags('Feature Flags')
@ApiBearerAuth('bearer')
@Controller('v1/feature-flags')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  @RequirePermission('workspace:read')
  @ApiOperation({ summary: 'List workspace feature flags' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ description: 'Feature flags' })
  list(@Tenant() tenant: TenantContextData) {
    return this.flags.list(tenant.workspaceId);
  }

  @Get('evaluate')
  @RequirePermission('workspace:read')
  @ApiOperation({ summary: 'Evaluate a feature flag for this workspace' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiQuery({ name: 'key', required: true })
  @ApiQuery({ name: 'default', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ description: 'Evaluation result' })
  async evaluate(
    @Tenant() tenant: TenantContextData,
    @Query(new ZodValidationPipe(evaluateQuerySchema))
    query: { key: string; default: boolean },
  ) {
    const enabled = await this.flags.isEnabled(
      tenant.workspaceId,
      query.key,
      query.default ?? false,
    );
    return { key: query.key, enabled };
  }

  @Put(':key')
  @RequirePermission('workspace:manage')
  @ApiOperation({ summary: 'Create or update a feature flag' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'key' })
  @ApiBody({ type: UpsertFeatureFlagDto })
  @ApiOkResponse({ description: 'Upserted flag' })
  upsert(
    @Tenant() tenant: TenantContextData,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(upsertFlagSchema)) body: UpsertFeatureFlagDto,
  ) {
    return this.flags.upsert(tenant.workspaceId, { key, ...body });
  }

  @Delete(':key')
  @RequirePermission('workspace:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a feature flag' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'key' })
  @ApiNoContentResponse()
  async remove(@Tenant() tenant: TenantContextData, @Param('key') key: string) {
    await this.flags.remove(tenant.workspaceId, key);
  }
}
