import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { AuditService } from '../application/audit.service';
import { AuditLogListResponseDto, ListAuditLogsQueryDto, listAuditLogsSchema } from './audit.dto';

@ApiTags('Audit')
@ApiBearerAuth('bearer')
@Controller('v1/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'List audit logs for the workspace' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true, description: 'Tenant workspace UUID' })
  @ApiOkResponse({ type: AuditLogListResponseDto })
  list(
    @Tenant() tenant: TenantContextData,
    @Query(new ZodValidationPipe(listAuditLogsSchema)) query: ListAuditLogsQueryDto,
  ) {
    return this.audit.list({
      workspaceId: tenant.workspaceId,
      cursor: query.cursor,
      limit: query.limit ?? 20,
      action: query.action,
    });
  }
}
