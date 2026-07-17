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
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { RequirePermission } from '../../../common/auth/require-permission.decorator';
import { Tenant } from '../../../common/tenant/tenant.decorator';
import type { TenantContextData } from '../../../common/tenant/tenant-context';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { FilesService } from '../application/files.service';

export const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(512),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative().max(5_000_000_000).optional(),
});

export class UploadUrlDto {
  @ApiProperty({ example: 'report.pdf' })
  filename!: string;

  @ApiProperty({ example: 'application/pdf' })
  contentType!: string;

  @ApiPropertyOptional({ example: 1024 })
  sizeBytes?: number;
}

export class FileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty()
  contentType!: string;

  @ApiPropertyOptional({ nullable: true, type: Number })
  sizeBytes!: number | null;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  scanStatus!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class UploadUrlResponseDto extends FileResponseDto {
  @ApiProperty()
  uploadUrl!: string;
}

export class DownloadUrlResponseDto extends FileResponseDto {
  @ApiProperty()
  downloadUrl!: string;
}

@ApiTags('Files')
@ApiBearerAuth('bearer')
@Controller('v1/files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @RequirePermission('file:read')
  @ApiOperation({ summary: 'List workspace files' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiOkResponse({ type: FileResponseDto, isArray: true })
  list(@Tenant() tenant: TenantContextData) {
    return this.files.list(tenant.workspaceId);
  }

  @Post('upload-url')
  @RequirePermission('file:write')
  @ApiOperation({ summary: 'Create file metadata and presigned upload URL' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiBody({ type: UploadUrlDto })
  @ApiCreatedResponse({ type: UploadUrlResponseDto })
  createUploadUrl(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(uploadUrlSchema)) body: z.infer<typeof uploadUrlSchema>,
  ) {
    return this.files.createUploadUrl(tenant.workspaceId, user.sub, body);
  }

  @Post(':fileId/confirm')
  @RequirePermission('file:write')
  @ApiOperation({ summary: 'Confirm upload completed' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'fileId', format: 'uuid' })
  @ApiOkResponse({ type: FileResponseDto })
  confirm(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.files.confirm(tenant.workspaceId, fileId, user.sub);
  }

  @Get(':fileId/download-url')
  @RequirePermission('file:read')
  @ApiOperation({ summary: 'Get presigned download URL' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'fileId', format: 'uuid' })
  @ApiOkResponse({ type: DownloadUrlResponseDto })
  downloadUrl(
    @Tenant() tenant: TenantContextData,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.files.downloadUrl(tenant.workspaceId, fileId);
  }

  @Delete(':fileId')
  @RequirePermission('file:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'fileId', format: 'uuid' })
  @ApiNoContentResponse()
  async remove(
    @Tenant() tenant: TenantContextData,
    @CurrentUser() user: AuthUser,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    await this.files.remove(tenant.workspaceId, fileId, user.sub);
  }
}
