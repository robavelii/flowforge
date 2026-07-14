import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ScheduleStatus, WorkflowStatus } from '@prisma/client';
import { CronExpressionParser } from 'cron-parser';
import { PrismaService } from '../../../persistence/prisma.service';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    const rows = await this.prisma.schedule.findMany({
      where: { workspaceId, status: { not: ScheduleStatus.deleted } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(
    workspaceId: string,
    input: {
      workflowId: string;
      name: string;
      cronExpression: string;
      timezone?: string;
    },
  ) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: input.workflowId, workspaceId, deletedAt: null },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    if (workflow.status !== WorkflowStatus.published || !workflow.publishedVersionId) {
      throw new BadRequestException('Workflow must be published to schedule');
    }

    let nextRunAt: Date;
    try {
      const interval = CronExpressionParser.parse(input.cronExpression, {
        tz: input.timezone ?? 'UTC',
      });
      nextRunAt = interval.next().toDate();
    } catch {
      throw new BadRequestException('Invalid cron expression');
    }

    const schedule = await this.prisma.schedule.create({
      data: {
        workspaceId,
        workflowId: input.workflowId,
        workflowVersionId: workflow.publishedVersionId,
        name: input.name.trim(),
        cronExpression: input.cronExpression,
        timezone: input.timezone ?? 'UTC',
        status: ScheduleStatus.active,
        nextRunAt,
      },
    });

    return this.toDto(schedule);
  }

  async pause(workspaceId: string, scheduleId: string) {
    const schedule = await this.require(workspaceId, scheduleId);
    const updated = await this.prisma.schedule.update({
      where: { id: schedule.id },
      data: { status: ScheduleStatus.paused },
    });
    return this.toDto(updated);
  }

  async resume(workspaceId: string, scheduleId: string) {
    const schedule = await this.require(workspaceId, scheduleId);
    let nextRunAt: Date;
    try {
      const interval = CronExpressionParser.parse(schedule.cronExpression, {
        tz: schedule.timezone,
      });
      nextRunAt = interval.next().toDate();
    } catch {
      throw new BadRequestException('Invalid cron expression on schedule');
    }
    const updated = await this.prisma.schedule.update({
      where: { id: schedule.id },
      data: { status: ScheduleStatus.active, nextRunAt },
    });
    return this.toDto(updated);
  }

  async remove(workspaceId: string, scheduleId: string) {
    const schedule = await this.require(workspaceId, scheduleId);
    await this.prisma.schedule.update({
      where: { id: schedule.id },
      data: { status: ScheduleStatus.deleted },
    });
  }

  private async require(workspaceId: string, scheduleId: string) {
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        id: scheduleId,
        workspaceId,
        status: { not: ScheduleStatus.deleted },
      },
    });
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }
    return schedule;
  }

  private toDto(schedule: {
    id: string;
    workspaceId: string;
    workflowId: string;
    workflowVersionId: string;
    name: string;
    cronExpression: string;
    timezone: string;
    status: ScheduleStatus;
    nextRunAt: Date | null;
    lastRunAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: schedule.id,
      workspaceId: schedule.workspaceId,
      workflowId: schedule.workflowId,
      workflowVersionId: schedule.workflowVersionId,
      name: schedule.name,
      cronExpression: schedule.cronExpression,
      timezone: schedule.timezone,
      status: schedule.status,
      nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
      lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    };
  }
}
