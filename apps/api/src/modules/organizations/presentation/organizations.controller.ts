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
import { OrganizationsService } from '../application/organizations.service';
import {
  CreateOrganizationDto,
  createOrgSchema,
  OrganizationResponseDto,
  UpdateOrganizationDto,
  updateOrgSchema,
} from './organizations.dto';

@ApiTags('Organizations')
@ApiBearerAuth('bearer')
@Controller('v1/organizations')
@SkipTenant()
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an organization' })
  @ApiBody({ type: CreateOrganizationDto })
  @ApiCreatedResponse({ type: OrganizationResponseDto })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrgSchema)) body: CreateOrganizationDto,
  ) {
    return this.orgs.create(user.sub, body);
  }

  @Get()
  @ApiOperation({ summary: 'List organizations for current user' })
  @ApiOkResponse({ type: OrganizationResponseDto, isArray: true })
  list(@CurrentUser() user: AuthUser) {
    return this.orgs.listForUser(user.sub);
  }

  @Get(':orgId')
  @ApiOperation({ summary: 'Get organization by id' })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  get(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.orgs.getById(user.sub, orgId);
  }

  @Patch(':orgId')
  @ApiOperation({ summary: 'Update organization' })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiBody({ type: UpdateOrganizationDto })
  @ApiOkResponse({ type: OrganizationResponseDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body(new ZodValidationPipe(updateOrgSchema)) body: UpdateOrganizationDto,
  ) {
    return this.orgs.update(user.sub, orgId, body);
  }

  @Delete(':orgId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete organization' })
  @ApiParam({ name: 'orgId', format: 'uuid' })
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ): Promise<void> {
    await this.orgs.softDelete(user.sub, orgId);
  }
}
