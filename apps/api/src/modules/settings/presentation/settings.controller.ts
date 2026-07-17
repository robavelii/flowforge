import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { SettingsService } from '../application/settings.service';

export const patchSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string().min(1).max(128),
        value: z.unknown(),
      }),
    )
    .min(1)
    .max(50),
});

export class SettingEntryDto {
  @ApiProperty({ example: 'timezone' })
  key!: string;

  @ApiProperty({ example: 'UTC' })
  value!: unknown;
}

export class PatchSettingsDto {
  @ApiProperty({ type: [SettingEntryDto] })
  settings!: SettingEntryDto[];
}

@ApiTags('Settings')
@ApiBearerAuth('bearer')
@Controller('v1/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission('workspace:read')
  @ApiOperation({ summary: 'List tenant settings' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ description: 'Settings key/value pairs' })
  list(@Tenant() tenant: TenantContextData) {
    return this.settings.list(tenant.workspaceId);
  }

  @Patch()
  @RequirePermission('workspace:manage')
  @ApiOperation({ summary: 'Upsert tenant settings' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiBody({ type: PatchSettingsDto })
  @ApiOkResponse({ description: 'Updated settings' })
  patch(
    @Tenant() tenant: TenantContextData,
    @Body(new ZodValidationPipe(patchSettingsSchema)) body: PatchSettingsDto,
  ) {
    return this.settings.upsert(tenant.workspaceId, body.settings);
  }
}
