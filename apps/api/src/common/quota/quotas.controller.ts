import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../auth/require-permission.decorator';
import { Tenant } from '../tenant/tenant.decorator';
import type { TenantContextData } from '../tenant/tenant-context';
import { QuotaService } from './quota.service';

class QuotaSnapshotDto {
  @ApiProperty({ example: 'executions' })
  metric!: string;

  @ApiProperty()
  current!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  remaining!: number;

  @ApiProperty()
  softLimitPercent!: number;

  @ApiProperty()
  periodStart!: string;

  @ApiProperty()
  periodEnd!: string;

  @ApiProperty()
  percentUsed!: number;
}

@ApiTags('Quotas')
@ApiBearerAuth('bearer')
@Controller('v1/quotas')
export class QuotasController {
  constructor(private readonly quotas: QuotaService) {}

  @Get()
  @RequirePermission('billing:read')
  @ApiOperation({ summary: 'Get current workspace quota usage' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ type: QuotaSnapshotDto, isArray: true })
  list(@Tenant() tenant: TenantContextData) {
    return this.quotas.listQuotas(tenant.workspaceId);
  }
}
