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
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../../common/auth/current-user.decorator';
import { SkipTenant } from '../../../common/tenant/skip-tenant.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { MembersService } from '../application/members.service';

const inviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.string().min(1).max(64).optional(),
});

const updateMemberSchema = z.object({
  role: z.string().min(1).max(64).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

const acceptInvitationSchema = z.object({
  token: z.string().min(1),
});

@ApiTags('Members')
@ApiBearerAuth()
@Controller('v1')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('workspaces/:workspaceId/members')
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  list(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ) {
    return this.members.list(workspaceId, user.sub);
  }

  @Post('workspaces/:workspaceId/invitations')
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  invite(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body(new ZodValidationPipe(inviteSchema)) body: z.infer<typeof inviteSchema>,
  ) {
    return this.members.invite(workspaceId, user.sub, body);
  }

  @Get('workspaces/:workspaceId/invitations')
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  listInvitations(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ) {
    return this.members.listInvitations(workspaceId, user.sub);
  }

  @Delete('workspaces/:workspaceId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  async cancelInvitation(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    await this.members.cancelInvitation(workspaceId, user.sub, invitationId);
  }

  @Patch('workspaces/:workspaceId/members/:userId')
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: z.infer<typeof updateMemberSchema>,
  ) {
    return this.members.updateMember(workspaceId, user.sub, targetUserId, body);
  }

  @Delete('workspaces/:workspaceId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ): Promise<void> {
    await this.members.removeMember(workspaceId, user.sub, targetUserId);
  }

  @Post('invitations/accept')
  @SkipTenant()
  accept(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: z.infer<typeof acceptInvitationSchema>,
  ) {
    return this.members.acceptInvitation(user.sub, user.email, body.token);
  }
}
