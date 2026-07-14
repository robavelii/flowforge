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
import { OrganizationsService } from '../application/organizations.service';

const createOrgSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(64).optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('v1/organizations')
@SkipTenant()
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrgSchema)) body: z.infer<typeof createOrgSchema>,
  ) {
    return this.orgs.create(user.sub, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.orgs.listForUser(user.sub);
  }

  @Get(':orgId')
  get(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.orgs.getById(user.sub, orgId);
  }

  @Patch(':orgId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body(new ZodValidationPipe(updateOrgSchema)) body: z.infer<typeof updateOrgSchema>,
  ) {
    return this.orgs.update(user.sub, orgId, body);
  }

  @Delete(':orgId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ): Promise<void> {
    await this.orgs.softDelete(user.sub, orgId);
  }
}
