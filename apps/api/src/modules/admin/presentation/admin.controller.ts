import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { DlqService } from '../application/dlq.service';
import { MaintenanceService } from '../application/maintenance.service';

const dlqQuerySchema = z.object({
  queue: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

@ApiTags('Admin')
@ApiBearerAuth('bearer')
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly dlq: DlqService,
    private readonly maintenance: MaintenanceService,
  ) {}

  @Get('dlq')
  @RequirePermission('workspace:manage')
  @ApiOperation({ summary: 'List failed jobs for managed queues' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiQuery({ name: 'queue', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Failed jobs grouped by queue' })
  listDlq(
    @Tenant() tenant: TenantContextData,
    @Query(new ZodValidationPipe(dlqQuerySchema))
    query: z.infer<typeof dlqQuerySchema>,
  ) {
    return this.dlq.list(tenant.workspaceId, query.queue, query.limit);
  }

  @Post('dlq/:queue/:jobId/replay')
  @RequirePermission('workspace:manage')
  @ApiOperation({ summary: 'Replay a failed queue job' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'queue' })
  @ApiParam({ name: 'jobId' })
  @ApiOkResponse({ description: 'Replay result' })
  replayDlq(
    @Tenant() tenant: TenantContextData,
    @Param('queue') queue: string,
    @Param('jobId') jobId: string,
  ) {
    return this.dlq.replay(tenant.workspaceId, queue, jobId);
  }

  @Delete('dlq/:queue/:jobId')
  @RequirePermission('workspace:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Discard a failed queue job' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'queue' })
  @ApiParam({ name: 'jobId' })
  @ApiNoContentResponse()
  async discardDlq(
    @Tenant() tenant: TenantContextData,
    @Param('queue') queue: string,
    @Param('jobId') jobId: string,
  ) {
    await this.dlq.discard(tenant.workspaceId, queue, jobId);
  }

  @Post('maintenance/cleanup')
  @RequirePermission('workspace:manage')
  @ApiOperation({ summary: 'Run retention cleanup for this workspace' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ description: 'Cleanup result' })
  cleanup(@Tenant() tenant: TenantContextData) {
    return this.maintenance.cleanup(tenant.workspaceId);
  }
}
