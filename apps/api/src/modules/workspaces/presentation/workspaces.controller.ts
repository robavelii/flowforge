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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { SkipTenant } from '../../../common/tenant/skip-tenant.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { WorkspacesService } from '../application/workspaces.service';

const createWorkspaceSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(64).optional(),
  description: z.string().max(2000).optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller('v1/workspaces')
@SkipTenant()
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createWorkspaceSchema)) body: z.infer<typeof createWorkspaceSchema>,
  ) {
    return this.workspaces.create(user.sub, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.listForUser(user.sub);
  }

  @Get(':workspaceId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ) {
    return this.workspaces.getById(user.sub, workspaceId);
  }

  @Patch(':workspaceId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body(new ZodValidationPipe(updateWorkspaceSchema)) body: z.infer<typeof updateWorkspaceSchema>,
  ) {
    return this.workspaces.update(user.sub, workspaceId, body);
  }

  @Delete(':workspaceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<void> {
    await this.workspaces.softDelete(user.sub, workspaceId);
  }
}
