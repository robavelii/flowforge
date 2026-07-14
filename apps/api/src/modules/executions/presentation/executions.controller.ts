import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
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
import { ExecutionsService } from '../application/executions.service';
import {
  ExecutionSummaryDto,
  listExecutionsQuerySchema,
  StartExecutionDto,
  startExecutionSchema,
} from './executions.dto';

@ApiTags('Executions')
@ApiBearerAuth('bearer')
@Controller('v1/executions')
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Get()
  @RequirePermission('execution:read')
  @ApiOperation({ summary: 'List workflow executions' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ type: ExecutionSummaryDto, isArray: true })
  list(
    @Tenant() tenant: TenantContextData,
    @Query(new ZodValidationPipe(listExecutionsQuerySchema))
    query: {
      workflowId?: string;
      status?: string;
      cursor?: string;
      limit: number;
    },
  ) {
    return this.executions.list(tenant.workspaceId, query);
  }

  @Get(':id')
  @RequirePermission('execution:read')
  @ApiOperation({ summary: 'Get execution detail with steps' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ExecutionSummaryDto })
  get(@Tenant() tenant: TenantContextData, @Param('id', ParseUUIDPipe) id: string) {
    return this.executions.get(tenant.workspaceId, id);
  }

  @Get(':id/logs')
  @RequirePermission('execution:read')
  @ApiOperation({ summary: 'Get execution logs' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  getLogs(@Tenant() tenant: TenantContextData, @Param('id', ParseUUIDPipe) id: string) {
    return this.executions.getLogs(tenant.workspaceId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('execution:cancel')
  @ApiOperation({ summary: 'Cancel a queued or running execution' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ExecutionSummaryDto })
  cancel(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.executions.cancel(tenant.workspaceId, id, user.sub);
  }

  @Post(':id/replay')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('execution:replay')
  @ApiOperation({ summary: 'Replay a failed or cancelled execution' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: ExecutionSummaryDto })
  replay(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.executions.replay(tenant.workspaceId, id, user.sub);
  }
}

@ApiTags('Workflows')
@ApiBearerAuth('bearer')
@Controller('v1/workflows')
export class WorkflowExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Post(':id/execute')
  @RequirePermission('workflow:execute')
  @ApiOperation({ summary: 'Manually trigger a published workflow' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: StartExecutionDto })
  @ApiCreatedResponse({ type: ExecutionSummaryDto })
  execute(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(startExecutionSchema)) body: StartExecutionDto,
  ) {
    return this.executions.startManual(tenant.workspaceId, user.sub, id, body);
  }

  @Post(':id/test')
  @RequirePermission('workflow:execute')
  @ApiOperation({ summary: 'Run a sandbox test execution of a published workflow' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: StartExecutionDto })
  @ApiCreatedResponse({ type: ExecutionSummaryDto })
  test(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(startExecutionSchema)) body: StartExecutionDto,
  ) {
    return this.executions.startTest(tenant.workspaceId, user.sub, id, body);
  }
}
