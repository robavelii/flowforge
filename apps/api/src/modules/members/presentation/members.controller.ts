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
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { SkipTenant } from '../../../common/tenant/skip-tenant.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { MembersService } from '../application/members.service';
import {
  AcceptInvitationDto,
  acceptInvitationSchema,
  InvitationCreatedResponseDto,
  InvitationResponseDto,
  InviteMemberDto,
  inviteSchema,
  MemberResponseDto,
  UpdateMemberDto,
  updateMemberSchema,
} from './members.dto';

@ApiTags('Members')
@ApiBearerAuth('bearer')
@Controller('v1')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('workspaces/:workspaceId/members')
  @ApiOperation({ summary: 'List workspace members' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true, description: 'Tenant workspace UUID' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiOkResponse({ type: MemberResponseDto, isArray: true })
  list(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ) {
    return this.members.list(workspaceId, user.sub);
  }

  @Post('workspaces/:workspaceId/invitations')
  @ApiOperation({ summary: 'Invite a member by email' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiBody({ type: InviteMemberDto })
  @ApiCreatedResponse({ type: InvitationCreatedResponseDto })
  invite(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body(new ZodValidationPipe(inviteSchema)) body: InviteMemberDto,
  ) {
    return this.members.invite(workspaceId, user.sub, body);
  }

  @Get('workspaces/:workspaceId/invitations')
  @ApiOperation({ summary: 'List workspace invitations' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiOkResponse({ type: InvitationResponseDto, isArray: true })
  listInvitations(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ) {
    return this.members.listInvitations(workspaceId, user.sub);
  }

  @Delete('workspaces/:workspaceId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a pending invitation' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'invitationId', format: 'uuid' })
  @ApiNoContentResponse()
  async cancelInvitation(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    await this.members.cancelInvitation(workspaceId, user.sub, invitationId);
  }

  @Patch('workspaces/:workspaceId/members/:userId')
  @ApiOperation({ summary: 'Update member role or status' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiBody({ type: UpdateMemberDto })
  @ApiOkResponse({ type: MemberResponseDto })
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMemberDto,
  ) {
    return this.members.updateMember(workspaceId, user.sub, targetUserId, body);
  }

  @Delete('workspaces/:workspaceId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a workspace member' })
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiNoContentResponse()
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ): Promise<void> {
    await this.members.removeMember(workspaceId, user.sub, targetUserId);
  }

  @Post('invitations/accept')
  @SkipTenant()
  @ApiOperation({ summary: 'Accept a workspace invitation' })
  @ApiBody({ type: AcceptInvitationDto })
  @ApiCreatedResponse({ type: MemberResponseDto })
  accept(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: AcceptInvitationDto,
  ) {
    return this.members.acceptInvitation(user.sub, user.email, body.token);
  }
}
