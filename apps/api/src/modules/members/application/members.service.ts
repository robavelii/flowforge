import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvitationStatus } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma.service';
import { OutboxService } from '../../../common/outbox/outbox.service';
import { generateOpaqueToken, sha256 } from '../../../common/utils/crypto.util';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async list(workspaceId: string, actorUserId: string) {
    await this.assertMember(workspaceId, actorUserId);
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async invite(
    workspaceId: string,
    actorUserId: string,
    input: { email: string; role?: string },
  ) {
    await this.assertMember(workspaceId, actorUserId, ['owner', 'admin']);
    const email = input.email.toLowerCase().trim();
    const role = input.role ?? 'member';

    const existingMember = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        user: { email, deletedAt: null },
      },
    });
    if (existingMember) {
      throw new ConflictException('User is already a workspace member');
    }

    const pending = await this.prisma.invitation.findFirst({
      where: { workspaceId, email, status: InvitationStatus.pending },
    });
    if (pending) {
      throw new ConflictException('Pending invitation already exists for this email');
    }

    const token = generateOpaqueToken(32);
    const invitation = await this.prisma.invitation.create({
      data: {
        workspaceId,
        email,
        role,
        invitedById: actorUserId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      // Returned once for delivery; production would email this
      token,
    };
  }

  async listInvitations(workspaceId: string, actorUserId: string) {
    await this.assertMember(workspaceId, actorUserId, ['owner', 'admin']);
    return this.prisma.invitation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        acceptedAt: true,
      },
    });
  }

  async cancelInvitation(workspaceId: string, actorUserId: string, invitationId: string) {
    await this.assertMember(workspaceId, actorUserId, ['owner', 'admin']);
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, workspaceId, status: InvitationStatus.pending },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    return this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.revoked },
    });
  }

  async acceptInvitation(userId: string, userEmail: string, token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!invitation || invitation.status !== InvitationStatus.pending) {
      throw new BadRequestException('Invalid invitation');
    }
    if (invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.expired },
      });
      throw new BadRequestException('Invitation expired');
    }
    if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new ForbiddenException('Invitation email does not match authenticated user');
    }

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId,
          },
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId,
          role: invitation.role,
        },
        update: {
          status: 'active',
          role: invitation.role,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.accepted,
          acceptedAt: new Date(),
        },
      });

      await this.outbox.append(
        {
          workspaceId: invitation.workspaceId,
          aggregateType: 'WorkspaceMember',
          aggregateId: member.id,
          eventType: 'MemberAdded',
          payload: {
            workspaceId: invitation.workspaceId,
            userId,
            role: invitation.role,
            via: 'invitation',
          },
        },
        tx,
      );

      return member;
    });
  }

  async updateMember(
    workspaceId: string,
    actorUserId: string,
    targetUserId: string,
    input: { role?: string; status?: 'active' | 'suspended' },
  ) {
    await this.assertMember(workspaceId, actorUserId, ['owner', 'admin']);
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: targetUserId },
      },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    if (member.role === 'owner' && actorUserId !== targetUserId) {
      throw new ForbiddenException('Cannot modify the workspace owner');
    }
    return this.prisma.workspaceMember.update({
      where: { id: member.id },
      data: {
        role: input.role,
        status: input.status,
      },
    });
  }

  async removeMember(workspaceId: string, actorUserId: string, targetUserId: string) {
    await this.assertMember(workspaceId, actorUserId, ['owner', 'admin']);
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: targetUserId },
      },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    if (member.role === 'owner') {
      throw new ForbiddenException('Cannot remove the workspace owner');
    }
    await this.prisma.workspaceMember.delete({ where: { id: member.id } });
  }

  private async assertMember(
    workspaceId: string,
    userId: string,
    roles?: string[],
  ): Promise<void> {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId, status: 'active' },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this workspace');
    }
    if (roles && !roles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient workspace role');
    }
  }
}
