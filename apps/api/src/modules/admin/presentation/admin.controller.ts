import {
  Controller,
  Delete,
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
import { OutboxAdminService } from '../application/outbox-admin.service';
import { PlatformMetricsService } from '../application/platform-metrics.service';

const dlqQuerySchema = z.object({
  queue: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const outboxQuerySchema = z.object({
  unpublishedOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v !== 'false'),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

@ApiTags('Admin')
@ApiBearerAuth('bearer')
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly dlq: DlqService,
    private readonly maintenance: MaintenanceService,
    private readonly outboxAdmin: OutboxAdminService,
    private readonly platformMetrics: PlatformMetricsService,
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

  @Get('outbox')
  @RequirePermission('workspace:manage')
  @ApiOperation({ summary: 'List outbox events for this workspace' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiQuery({ name: 'unpublishedOnly', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Outbox events' })
  listOutbox(
    @Tenant() tenant: TenantContextData,
    @Query(new ZodValidationPipe(outboxQuerySchema))
    query: z.infer<typeof outboxQuerySchema>,
  ) {
    return this.outboxAdmin.list(tenant.workspaceId, {
      unpublishedOnly: query.unpublishedOnly,
      limit: query.limit,
    });
  }

  @Post('outbox/:eventId/replay')
  @RequirePermission('workspace:manage')
  @ApiOperation({ summary: 'Re-queue an outbox event for publishing' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiOkResponse({ description: 'Replay result' })
  replayOutbox(
    @Tenant() tenant: TenantContextData,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.outboxAdmin.replay(tenant.workspaceId, eventId);
  }

  @Get('metrics')
  @RequirePermission('workspace:manage')
  @ApiOperation({ summary: 'Workspace system metrics summary' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ description: 'Metrics summary' })
  metrics(@Tenant() tenant: TenantContextData) {
    return this.platformMetrics.summary(tenant.workspaceId);
  }
}
