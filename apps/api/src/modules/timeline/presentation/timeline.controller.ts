import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { TimelineService } from '../application/timeline.service';
import { ListTimelineQueryDto, listTimelineSchema, TimelineListResponseDto } from './timeline.dto';

@ApiTags('Timeline')
@ApiBearerAuth('bearer')
@Controller('v1/timeline')
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get()
  @RequirePermission('timeline:read')
  @ApiOperation({ summary: 'List activity timeline events for the workspace' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true, description: 'Tenant workspace UUID' })
  @ApiOkResponse({ type: TimelineListResponseDto })
  list(
    @Tenant() tenant: TenantContextData,
    @Query(new ZodValidationPipe(listTimelineSchema)) query: ListTimelineQueryDto,
  ) {
    return this.timeline.list({
      workspaceId: tenant.workspaceId,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
  }
}
