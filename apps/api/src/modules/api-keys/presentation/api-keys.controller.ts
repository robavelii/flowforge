import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ApiKeysService } from '../application/api-keys.service';
import {
  ApiKeyCreatedResponseDto,
  ApiKeyResponseDto,
  CreateApiKeyDto,
  createApiKeySchema,
} from './api-keys.dto';

@ApiTags('API Keys')
@ApiBearerAuth('bearer')
@Controller('v1/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @RequirePermission('api_key:read')
  @ApiOperation({ summary: 'List API keys for the workspace' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true, description: 'Tenant workspace UUID' })
  @ApiOkResponse({ type: ApiKeyResponseDto, isArray: true })
  list(@Tenant() tenant: TenantContextData) {
    return this.apiKeys.list(tenant.workspaceId);
  }

  @Post()
  @RequirePermission('api_key:create')
  @ApiOperation({ summary: 'Create an API key (raw key returned once)' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true, description: 'Tenant workspace UUID' })
  @ApiBody({ type: CreateApiKeyDto })
  @ApiCreatedResponse({ type: ApiKeyCreatedResponseDto })
  create(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(tenant.workspaceId, user.sub, body);
  }

  @Delete(':id')
  @RequirePermission('api_key:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true, description: 'Tenant workspace UUID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  async revoke(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.apiKeys.revoke(tenant.workspaceId, id, user.sub);
  }
}
