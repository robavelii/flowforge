import { BadRequestException, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IntegrationProvider } from '@prisma/client';
import { Public } from '../../../common/auth/public.decorator';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { SkipTenant } from '../../../common/tenant/skip-tenant.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { IntegrationsService } from '../application/integrations.service';

export class IntegrationProviderDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [String] })
  scopes!: string[];

  @ApiProperty()
  configured!: boolean;
}

@ApiTags('Integrations')
@Controller('v1/integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('providers')
  @Public()
  @SkipTenant()
  @ApiOperation({ summary: 'List available integration providers' })
  @ApiOkResponse({ type: IntegrationProviderDto, isArray: true })
  listProviders() {
    return this.integrations.listProviders();
  }

  @Get()
  @ApiBearerAuth('bearer')
  @RequirePermission('integration:read')
  @ApiOperation({ summary: 'List connected workspace integrations' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  list(@Tenant() tenant: TenantContextData) {
    return this.integrations.list(tenant.workspaceId);
  }

  @Post(':provider/connect')
  @ApiBearerAuth('bearer')
  @RequirePermission('integration:write')
  @ApiOperation({ summary: 'Start OAuth connect for a provider' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'provider', enum: ['github', 'google'] })
  connect(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: string,
  ) {
    const normalized =
      provider === 'github'
        ? IntegrationProvider.github
        : provider === 'google'
          ? IntegrationProvider.google
          : null;
    if (!normalized) {
      throw new BadRequestException('Unknown provider');
    }
    return this.integrations.startConnect(tenant.workspaceId, user.sub, normalized);
  }

  @Get('callback/:provider')
  @Public()
  @SkipTenant()
  @ApiOperation({ summary: 'OAuth callback for integration connect' })
  @ApiParam({ name: 'provider', enum: ['github', 'google'] })
  callback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const normalized =
      provider === 'github'
        ? IntegrationProvider.github
        : provider === 'google'
          ? IntegrationProvider.google
          : null;
    if (!normalized || !code || !state) {
      throw new BadRequestException('Invalid callback');
    }
    return this.integrations.handleCallback(normalized, code, state);
  }

  @Delete(':id')
  @ApiBearerAuth('bearer')
  @RequirePermission('integration:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect an integration' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  async disconnect(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.integrations.disconnect(tenant.workspaceId, id, user.sub);
  }
}
