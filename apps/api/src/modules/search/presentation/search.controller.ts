import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { SearchService } from '../../workflows/application/search.service';

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().positive().max(50).optional(),
  entityType: z.enum(['workflow', 'execution', 'member', 'audit']).optional(),
});

export class SearchHitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  entityType!: string;

  @ApiProperty({ format: 'uuid' })
  entityId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  highlight!: string | null;
}

@ApiTags('Search')
@ApiBearerAuth('bearer')
@Controller('v1/search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @RequirePermission('workspace:read')
  @ApiOperation({ summary: 'Full-text search across workspace entities' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ type: SearchHitDto, isArray: true })
  searchWorkspace(
    @Tenant() tenant: TenantContextData,
    @Query(new ZodValidationPipe(searchQuerySchema))
    query: z.infer<typeof searchQuerySchema>,
  ) {
    return this.search.search(tenant.workspaceId, query.q, {
      limit: query.limit,
      entityType: query.entityType,
    });
  }
}
