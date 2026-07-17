import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { SkipTenant } from '../../../common/tenant/skip-tenant.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { NotificationsService } from '../application/notifications.service';

export const updatePreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        channel: z.enum(['email', 'slack', 'webhook']),
        eventType: z.string().min(1).max(64),
        enabled: z.boolean(),
        config: z.record(z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export class PreferenceItemDto {
  @ApiProperty({ enum: ['email', 'slack', 'webhook'] })
  channel!: string;

  @ApiProperty({ example: 'execution_failure' })
  eventType!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiPropertyOptional({ type: Object, nullable: true })
  config!: Record<string, unknown> | null;
}

export class UpdatePreferencesDto {
  @ApiProperty({ type: PreferenceItemDto, isArray: true })
  preferences!: PreferenceItemDto[];
}

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  templateKey!: string;

  @ApiProperty()
  channel!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  recipient!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

@ApiTags('Notifications')
@ApiBearerAuth('bearer')
@Controller('v1')
export class NotificationPreferencesController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('users/me/notification-preferences')
  @SkipTenant()
  @ApiOperation({ summary: 'Get current user notification preferences' })
  @ApiOkResponse({ type: PreferenceItemDto, isArray: true })
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.notifications.getPreferences(user.sub);
  }

  @Patch('users/me/notification-preferences')
  @SkipTenant()
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiBody({ type: UpdatePreferencesDto })
  @ApiOkResponse({ type: PreferenceItemDto, isArray: true })
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updatePreferencesSchema))
    body: z.infer<typeof updatePreferencesSchema>,
  ) {
    return this.notifications.updatePreferences(user.sub, body.preferences);
  }
}

@ApiTags('Notifications')
@ApiBearerAuth('bearer')
@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermission('workspace:read')
  @ApiOperation({ summary: 'List workspace notifications' })
  @ApiOkResponse({ type: NotificationResponseDto, isArray: true })
  list(@Tenant() tenant: TenantContextData) {
    return this.notifications.listWorkspace(tenant.workspaceId);
  }
}
