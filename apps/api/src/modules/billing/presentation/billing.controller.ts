import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { SkipTenant } from '../../../common/tenant/skip-tenant.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { BillingService } from '../application/billing.service';

export const changePlanSchema = z.object({
  planSlug: z.string().min(1).max(64),
});

export const usageQuerySchema = z.object({
  metric: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export class PlanDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'free' })
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description!: string | null;

  @ApiProperty()
  executionsPerMonth!: number;

  @ApiProperty()
  storageBytes!: number;

  @ApiProperty()
  apiRequestsPerMinute!: number;

  @ApiProperty()
  softLimitPercent!: number;

  @ApiProperty()
  isDefault!: boolean;
}

export class ChangePlanDto {
  @ApiProperty({ example: 'pro' })
  planSlug!: string;
}

@ApiTags('Billing')
@ApiBearerAuth('bearer')
@Controller('v1/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  @SkipTenant()
  @ApiOperation({ summary: 'List available billing plans' })
  @ApiOkResponse({ type: PlanDto, isArray: true })
  listPlans() {
    return this.billing.listPlans();
  }

  @Get('subscription')
  @RequirePermission('billing:read')
  @ApiOperation({ summary: 'Get current workspace subscription' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ description: 'Active subscription' })
  getSubscription(@Tenant() tenant: TenantContextData) {
    return this.billing.getSubscription(tenant.workspaceId);
  }

  @Patch('subscription')
  @RequirePermission('billing:manage')
  @ApiOperation({ summary: 'Change workspace plan (Stripe-ready abstraction)' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiBody({ type: ChangePlanDto })
  @ApiOkResponse({ description: 'Updated subscription' })
  changePlan(
    @Tenant() tenant: TenantContextData,
    @Body(new ZodValidationPipe(changePlanSchema)) body: ChangePlanDto,
  ) {
    return this.billing.changePlan(tenant.workspaceId, body.planSlug);
  }

  @Get('usage')
  @RequirePermission('billing:read')
  @ApiOperation({ summary: 'List recent usage records' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiQuery({ name: 'metric', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Usage records' })
  listUsage(
    @Tenant() tenant: TenantContextData,
    @Query(new ZodValidationPipe(usageQuerySchema))
    query: z.infer<typeof usageQuerySchema>,
  ) {
    return this.billing.listUsage(tenant.workspaceId, query);
  }
}
