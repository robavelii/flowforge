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
  Query,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { WorkflowsService } from '../application/workflows.service';
import { SearchService } from '../application/search.service';
import { NODE_TYPE_REGISTRY } from '../domain/node-registry';
import {
  CreateWorkflowDto,
  createWorkflowSchema,
  DuplicateWorkflowDto,
  duplicateWorkflowSchema,
  PublishWorkflowDto,
  publishWorkflowSchema,
  RollbackWorkflowDto,
  rollbackWorkflowSchema,
  SearchHitDto,
  searchQuerySchema,
  UnpublishWorkflowDto,
  unpublishWorkflowSchema,
  UpdateWorkflowDto,
  updateWorkflowSchema,
  WorkflowDetailDto,
  WorkflowSummaryDto,
  WorkflowVersionSummaryDto,
} from './workflows.dto';

@ApiTags('Workflows')
@ApiBearerAuth('bearer')
@Controller('v1/workflows')
export class WorkflowsController {
  constructor(
    private readonly workflows: WorkflowsService,
    private readonly search: SearchService,
  ) {}

  @Get('node-types')
  @RequirePermission('workflow:read')
  @ApiOperation({ summary: 'List registered workflow node types' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ description: 'Node type registry' })
  listNodeTypes() {
    return NODE_TYPE_REGISTRY;
  }

  @Get('search')
  @RequirePermission('workflow:read')
  @ApiOperation({ summary: 'Search workflows (and indexed entities) in the workspace' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: SearchHitDto, isArray: true })
  searchWorkspace(
    @Tenant() tenant: TenantContextData,
    @Query(new ZodValidationPipe(searchQuerySchema)) query: { q: string; limit: number },
  ) {
    return this.search.search(tenant.workspaceId, query.q, { limit: query.limit });
  }

  @Get()
  @RequirePermission('workflow:read')
  @ApiOperation({ summary: 'List workflows' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ type: WorkflowSummaryDto, isArray: true })
  list(@Tenant() tenant: TenantContextData) {
    return this.workflows.list(tenant.workspaceId);
  }

  @Post()
  @RequirePermission('workflow:create')
  @ApiOperation({ summary: 'Create a draft workflow' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiBody({ type: CreateWorkflowDto })
  @ApiCreatedResponse({ type: WorkflowSummaryDto })
  create(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createWorkflowSchema)) body: CreateWorkflowDto,
  ) {
    return this.workflows.create(tenant.workspaceId, user.sub, body);
  }

  @Get(':id')
  @RequirePermission('workflow:read')
  @ApiOperation({ summary: 'Get workflow with draft graph' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: WorkflowDetailDto })
  get(@Tenant() tenant: TenantContextData, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflows.get(tenant.workspaceId, id);
  }

  @Patch(':id')
  @RequirePermission('workflow:write')
  @ApiOperation({ summary: 'Update draft workflow metadata/graph (optimistic lock)' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateWorkflowDto })
  @ApiOkResponse({ type: WorkflowSummaryDto })
  update(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWorkflowSchema)) body: UpdateWorkflowDto,
  ) {
    return this.workflows.update(tenant.workspaceId, id, user.sub, body);
  }

  @Delete(':id')
  @RequirePermission('workflow:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a workflow' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  async remove(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.workflows.softDelete(tenant.workspaceId, id, user.sub);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('workflow:publish')
  @ApiOperation({ summary: 'Publish draft as an immutable version' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: PublishWorkflowDto })
  @ApiOkResponse({ type: WorkflowSummaryDto })
  publish(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(publishWorkflowSchema)) body: PublishWorkflowDto,
  ) {
    return this.workflows.publish(tenant.workspaceId, id, user.sub, body);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('workflow:publish')
  @ApiOperation({ summary: 'Unpublish (disable) the live version' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UnpublishWorkflowDto })
  @ApiOkResponse({ type: WorkflowSummaryDto })
  unpublish(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(unpublishWorkflowSchema)) body: UnpublishWorkflowDto,
  ) {
    return this.workflows.unpublish(tenant.workspaceId, id, user.sub, body.reason);
  }

  @Post(':id/rollback')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('workflow:write')
  @ApiOperation({ summary: 'Copy a published version back into the draft' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: RollbackWorkflowDto })
  @ApiOkResponse({ type: WorkflowDetailDto })
  rollback(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rollbackWorkflowSchema)) body: RollbackWorkflowDto,
  ) {
    return this.workflows.rollback(tenant.workspaceId, id, user.sub, body);
  }

  @Get(':id/versions')
  @RequirePermission('workflow:read')
  @ApiOperation({ summary: 'List published versions' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: WorkflowVersionSummaryDto, isArray: true })
  listVersions(@Tenant() tenant: TenantContextData, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflows.listVersions(tenant.workspaceId, id);
  }

  @Get(':id/versions/:versionId')
  @RequirePermission('workflow:read')
  @ApiOperation({ summary: 'Get a specific published version' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiOkResponse({ type: WorkflowVersionSummaryDto })
  getVersion(
    @Tenant() tenant: TenantContextData,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.workflows.getVersion(tenant.workspaceId, id, versionId);
  }

  @Post(':id/duplicate')
  @RequirePermission('workflow:create')
  @ApiOperation({ summary: 'Duplicate a workflow as a new draft' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: DuplicateWorkflowDto })
  @ApiCreatedResponse({ type: WorkflowSummaryDto })
  duplicate(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(duplicateWorkflowSchema)) body: DuplicateWorkflowDto,
  ) {
    return this.workflows.duplicate(tenant.workspaceId, id, user.sub, body.name);
  }
}
