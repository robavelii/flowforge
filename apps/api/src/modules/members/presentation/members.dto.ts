import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const inviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.string().min(1).max(64).optional(),
});

export class InviteMemberDto {
  @ApiProperty({ example: 'colleague@example.com' })
  email!: string;

  @ApiPropertyOptional({ example: 'member', default: 'member' })
  role?: string;
}

export const updateMemberSchema = z.object({
  role: z.string().min(1).max(64).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export class UpdateMemberDto {
  @ApiPropertyOptional({ example: 'admin' })
  role?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended'] })
  status?: 'active' | 'suspended';
}

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
});

export class AcceptInvitationDto {
  @ApiProperty({ description: 'Invitation token from invite response/email' })
  token!: string;
}

export class MemberUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;
}

export class MemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: ['active', 'suspended'] })
  status!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({ format: 'date-time' })
  joinedAt!: string;

  @ApiProperty({ type: MemberUserDto })
  user!: MemberUserDto;
}

export class InvitationCreatedResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({ enum: ['pending', 'accepted', 'revoked', 'expired'] })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({
    description: 'Returned once for delivery; do not store in logs',
  })
  token!: string;
}

export class InvitationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({ enum: ['pending', 'accepted', 'revoked', 'expired'] })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  acceptedAt!: string | null;
}
