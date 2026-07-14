import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { SchedulesService } from '../application/schedules.service';

export const createScheduleSchema = z.object({
  workflowId: z.string().uuid(),
  name: z.string().min(1).max(255),
  cronExpression: z.string().min(1).max(128),
  timezone: z.string().min(1).max(64).optional(),
});

export class CreateScheduleDto {
  @ApiProperty({ format: 'uuid' })
  workflowId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: '*/5 * * * *' })
  cronExpression!: string;

  @ApiPropertyOptional({ example: 'UTC' })
  timezone?: string;
}

export class ScheduleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ format: 'uuid' })
  workflowId!: string;

  @ApiProperty({ format: 'uuid' })
  workflowVersionId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  cronExpression!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ enum: ['active', 'paused', 'deleted'] })
  status!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  nextRunAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  lastRunAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

@ApiTags('Schedules')
@ApiBearerAuth('bearer')
@Controller('v1/schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  @RequirePermission('workflow:read')
  @ApiOperation({ summary: 'List cron schedules' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ type: ScheduleResponseDto, isArray: true })
  list(@Tenant() tenant: TenantContextData) {
    return this.schedules.list(tenant.workspaceId);
  }

  @Post()
  @RequirePermission('workflow:publish')
  @ApiOperation({ summary: 'Create a cron schedule for a published workflow' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiBody({ type: CreateScheduleDto })
  @ApiCreatedResponse({ type: ScheduleResponseDto })
  create(
    @Tenant() tenant: TenantContextData,
    @Body(new ZodValidationPipe(createScheduleSchema)) body: CreateScheduleDto,
  ) {
    return this.schedules.create(tenant.workspaceId, body);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('workflow:publish')
  @ApiOperation({ summary: 'Pause a schedule' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ScheduleResponseDto })
  pause(@Tenant() tenant: TenantContextData, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedules.pause(tenant.workspaceId, id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('workflow:publish')
  @ApiOperation({ summary: 'Resume a paused schedule' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ScheduleResponseDto })
  resume(@Tenant() tenant: TenantContextData, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedules.resume(tenant.workspaceId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('workflow:publish')
  @ApiOperation({ summary: 'Delete a schedule' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  async remove(
    @Tenant() tenant: TenantContextData,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.schedules.remove(tenant.workspaceId, id);
  }
}
