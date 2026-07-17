import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { SkipTenant } from '../../../common/tenant/skip-tenant.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { WorkspacesService } from '../application/workspaces.service';
import {
  CreateWorkspaceDto,
  createWorkspaceSchema,
  UpdateWorkspaceDto,
  updateWorkspaceSchema,
  WorkspaceResponseDto,
} from './workspaces.dto';

@ApiTags('Workspaces')
@ApiBearerAuth('bearer')
@Controller('v1/workspaces')
@SkipTenant()
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a workspace in an organization' })
  @ApiBody({ type: CreateWorkspaceDto })
  @ApiCreatedResponse({ type: WorkspaceResponseDto })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createWorkspaceSchema)) body: CreateWorkspaceDto,
  ) {
    return this.workspaces.create(user.sub, body);
  }

  @Get()
  @ApiOperation({ summary: 'List workspaces for current user' })
  @ApiOkResponse({ type: WorkspaceResponseDto, isArray: true })
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.listForUser(user.sub);
  }

  @Get(':workspaceId')
  @ApiOperation({ summary: 'Get workspace by id' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  get(@CurrentUser() user: AuthUser, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.getById(user.sub, workspaceId);
  }

  @Patch(':workspaceId')
  @ApiOperation({ summary: 'Update workspace' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiBody({ type: UpdateWorkspaceDto })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body(new ZodValidationPipe(updateWorkspaceSchema)) body: UpdateWorkspaceDto,
  ) {
    return this.workspaces.update(user.sub, workspaceId, body);
  }

  @Delete(':workspaceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete workspace' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<void> {
    await this.workspaces.softDelete(user.sub, workspaceId);
  }
}
