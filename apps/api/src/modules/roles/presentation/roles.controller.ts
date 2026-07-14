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
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { RolesService } from '../application/roles.service';
import {
  CreateRoleDto,
  createRoleSchema,
  PermissionResponseDto,
  RoleResponseDto,
  UpdateRoleDto,
  updateRoleSchema,
} from './roles.dto';

@ApiTags('Roles')
@ApiBearerAuth('bearer')
@Controller('v1')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  @RequirePermission('role:read')
  @ApiOperation({ summary: 'List system and workspace roles' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true, description: 'Tenant workspace UUID' })
  @ApiOkResponse({ type: RoleResponseDto, isArray: true })
  list(@Tenant() tenant: TenantContextData) {
    return this.roles.listSystemAndWorkspaceRoles(tenant.workspaceId);
  }

  @Post('roles')
  @RequirePermission('role:create')
  @ApiOperation({ summary: 'Create a custom workspace role' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true, description: 'Tenant workspace UUID' })
  @ApiBody({ type: CreateRoleDto })
  @ApiCreatedResponse({ type: RoleResponseDto })
  create(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleDto,
  ) {
    return this.roles.createCustomRole(tenant.workspaceId, body, user.sub);
  }

  @Patch('roles/:roleId')
  @RequirePermission('role:write')
  @ApiOperation({ summary: 'Update custom role permissions' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true, description: 'Tenant workspace UUID' })
  @ApiParam({ name: 'roleId', format: 'uuid' })
  @ApiBody({ type: UpdateRoleDto })
  @ApiOkResponse({ type: RoleResponseDto })
  update(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleDto,
  ) {
    return this.roles.updateCustomRole(tenant.workspaceId, roleId, body, user.sub);
  }

  @Delete('roles/:roleId')
  @RequirePermission('role:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a custom role' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true, description: 'Tenant workspace UUID' })
  @ApiParam({ name: 'roleId', format: 'uuid' })
  @ApiNoContentResponse()
  async remove(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<void> {
    await this.roles.deleteCustomRole(tenant.workspaceId, roleId, user.sub);
  }

  @Get('permissions')
  @RequirePermission('role:read')
  @ApiOperation({ summary: 'List all permissions in the catalog' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true, description: 'Tenant workspace UUID' })
  @ApiOkResponse({ type: PermissionResponseDto, isArray: true })
  listPermissions() {
    return this.roles.listPermissions();
  }
}
