import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkflowNodeType, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma.service';
import { OutboxService } from '../../../common/outbox/outbox.service';
import { AuditService } from '../../audit/application/audit.service';
import { EMPTY_GRAPH, workflowGraphSchema, type WorkflowGraph } from '../domain/graph.schema';
import { resolveNodeType } from '../domain/node-registry';
import { WorkflowCacheService } from '../infrastructure/workflow-cache.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly cache: WorkflowCacheService,
  ) {}

  async list(workspaceId: string) {
    const rows = await this.prisma.workflow.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        description: true,
        status: true,
        isTemplate: true,
        version: true,
        publishedVersionId: true,
        createdByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async get(workspaceId: string, workflowId: string) {
    const workflow = await this.requireWorkflow(workspaceId, workflowId);
    const draft = await this.prisma.workflowDraft.findUnique({
      where: { workflowId },
    });
    return {
      ...this.toSummary(workflow),
      graph: (draft?.graphJson as WorkflowGraph) ?? EMPTY_GRAPH,
      draftSavedAt: draft?.savedAt?.toISOString() ?? null,
    };
  }

  async create(
    workspaceId: string,
    userId: string,
    input: { name: string; description?: string; graph?: WorkflowGraph },
  ) {
    const graph = this.parseGraph(input.graph ?? EMPTY_GRAPH);

    return this.prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.create({
        data: {
          workspaceId,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          status: WorkflowStatus.draft,
          createdByUserId: userId,
        },
      });

      await tx.workflowDraft.create({
        data: {
          workflowId: workflow.id,
          graphJson: graph as unknown as Prisma.InputJsonValue,
          savedById: userId,
        },
      });

      await this.outbox.append(
        {
          workspaceId,
          aggregateType: 'Workflow',
          aggregateId: workflow.id,
          eventType: 'WorkflowCreated',
          payload: {
            workflowId: workflow.id,
            workspaceId,
            name: workflow.name,
            createdBy: userId,
          },
        },
        tx,
      );

      await this.audit.write(
        {
          workspaceId,
          actorUserId: userId,
          action: 'workflow.created',
          resourceType: 'Workflow',
          resourceId: workflow.id,
          metadata: { name: workflow.name },
        },
        tx,
      );

      return this.toSummary(workflow);
    });
  }

  async update(
    workspaceId: string,
    workflowId: string,
    userId: string,
    input: {
      name?: string;
      description?: string | null;
      graph?: WorkflowGraph;
      expectedVersion: number;
    },
  ) {
    const workflow = await this.requireWorkflow(workspaceId, workflowId);

    if (workflow.version !== input.expectedVersion) {
      throw new ConflictException({
        message: 'Workflow has been modified; refresh and retry',
        currentVersion: workflow.version,
        expectedVersion: input.expectedVersion,
      });
    }

    const graph =
      input.graph !== undefined ? this.parseGraph(input.graph) : undefined;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workflow.updateMany({
        where: {
          id: workflowId,
          workspaceId,
          deletedAt: null,
          version: input.expectedVersion,
        },
        data: {
          name: input.name?.trim(),
          description:
            input.description === undefined
              ? undefined
              : input.description?.trim() || null,
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        throw new ConflictException('Workflow has been modified; refresh and retry');
      }

      if (graph) {
        await tx.workflowDraft.update({
          where: { workflowId },
          data: {
            graphJson: graph as unknown as Prisma.InputJsonValue,
            savedAt: new Date(),
            savedById: userId,
          },
        });
      }

      const row = await tx.workflow.findUniqueOrThrow({ where: { id: workflowId } });

      await this.outbox.append(
        {
          workspaceId,
          aggregateType: 'Workflow',
          aggregateId: workflowId,
          eventType: 'WorkflowUpdated',
          payload: {
            workflowId,
            workspaceId,
            version: row.version,
            changeSummary: graph ? 'graph' : 'metadata',
            updatedBy: userId,
          },
        },
        tx,
      );

      return this.toSummary(row);
    });
  }

  async softDelete(workspaceId: string, workflowId: string, userId: string) {
    await this.requireWorkflow(workspaceId, workflowId);

    await this.prisma.$transaction(async (tx) => {
      await tx.workflow.update({
        where: { id: workflowId },
        data: {
          deletedAt: new Date(),
          publishedVersionId: null,
          status: WorkflowStatus.unpublished,
        },
      });

      await this.outbox.append(
        {
          workspaceId,
          aggregateType: 'Workflow',
          aggregateId: workflowId,
          eventType: 'WorkflowDeleted',
          payload: { workflowId, workspaceId, deletedBy: userId },
        },
        tx,
      );

      await this.audit.write(
        {
          workspaceId,
          actorUserId: userId,
          action: 'workflow.deleted',
          resourceType: 'Workflow',
          resourceId: workflowId,
        },
        tx,
      );
    });

    await this.cache.invalidate(workspaceId, workflowId);
  }

  async publish(
    workspaceId: string,
    workflowId: string,
    userId: string,
    input: { changelog?: string; expectedVersion: number },
  ) {
    const workflow = await this.requireWorkflow(workspaceId, workflowId);
    if (workflow.version !== input.expectedVersion) {
      throw new ConflictException('Workflow has been modified; refresh and retry');
    }

    const draft = await this.prisma.workflowDraft.findUnique({
      where: { workflowId },
    });
    if (!draft) {
      throw new BadRequestException('Workflow draft missing');
    }

    const graph = this.parseGraph(draft.graphJson);
    if (graph.nodes.length === 0) {
      throw new BadRequestException('Cannot publish an empty graph');
    }

    const snapshotHash = this.hashGraph(graph);

    const result = await this.prisma.$transaction(async (tx) => {
      const lock = await tx.workflow.updateMany({
        where: {
          id: workflowId,
          workspaceId,
          deletedAt: null,
          version: input.expectedVersion,
        },
        data: { version: { increment: 1 } },
      });
      if (lock.count === 0) {
        throw new ConflictException('Workflow has been modified; refresh and retry');
      }

      const last = await tx.workflowVersion.findFirst({
        where: { workflowId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      const versionNumber = (last?.versionNumber ?? 0) + 1;

      const version = await tx.workflowVersion.create({
        data: {
          workspaceId,
          workflowId,
          versionNumber,
          changelog: input.changelog?.trim() || null,
          snapshotHash,
          graphJson: graph as unknown as Prisma.InputJsonValue,
          publishedById: userId,
          publishedAt: new Date(),
        },
      });

      await this.materializeGraph(tx, version.id, graph);

      await tx.workflow.update({
        where: { id: workflowId },
        data: {
          status: WorkflowStatus.published,
          publishedVersionId: version.id,
        },
      });

      await this.outbox.append(
        {
          workspaceId,
          aggregateType: 'Workflow',
          aggregateId: workflowId,
          eventType: 'WorkflowPublished',
          payload: {
            workflowId,
            workspaceId,
            versionId: version.id,
            versionNumber,
            publishedBy: userId,
          },
        },
        tx,
      );

      await this.audit.write(
        {
          workspaceId,
          actorUserId: userId,
          action: 'workflow.published',
          resourceType: 'Workflow',
          resourceId: workflowId,
          metadata: { versionId: version.id, versionNumber },
        },
        tx,
      );

      const row = await tx.workflow.findUniqueOrThrow({ where: { id: workflowId } });
      return { workflow: row, version };
    });

    await this.cache.setPublished(workspaceId, workflowId, {
      workflowId,
      versionId: result.version.id,
      versionNumber: result.version.versionNumber,
      graph,
      snapshotHash,
      publishedAt: result.version.publishedAt.toISOString(),
    });

    return {
      ...this.toSummary(result.workflow),
      publishedVersion: this.toVersionSummary(result.version),
    };
  }

  async unpublish(workspaceId: string, workflowId: string, userId: string, reason?: string) {
    await this.requireWorkflow(workspaceId, workflowId);

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workflow.update({
        where: { id: workflowId },
        data: {
          status: WorkflowStatus.unpublished,
          publishedVersionId: null,
          version: { increment: 1 },
        },
      });

      await this.outbox.append(
        {
          workspaceId,
          aggregateType: 'Workflow',
          aggregateId: workflowId,
          eventType: 'WorkflowUnpublished',
          payload: {
            workflowId,
            workspaceId,
            unpublishedBy: userId,
            reason: reason ?? null,
          },
        },
        tx,
      );

      await this.audit.write(
        {
          workspaceId,
          actorUserId: userId,
          action: 'workflow.unpublished',
          resourceType: 'Workflow',
          resourceId: workflowId,
          metadata: { reason: reason ?? null },
        },
        tx,
      );

      return updated;
    });

    await this.cache.invalidate(workspaceId, workflowId);
    return this.toSummary(row);
  }

  async rollback(
    workspaceId: string,
    workflowId: string,
    userId: string,
    input: { versionId: string; expectedVersion: number },
  ) {
    const workflow = await this.requireWorkflow(workspaceId, workflowId);
    if (workflow.version !== input.expectedVersion) {
      throw new ConflictException('Workflow has been modified; refresh and retry');
    }

    const target = await this.prisma.workflowVersion.findFirst({
      where: { id: input.versionId, workflowId, workspaceId },
    });
    if (!target) {
      throw new NotFoundException('Version not found');
    }

    const graph = this.parseGraph(target.graphJson);

    return this.prisma.$transaction(async (tx) => {
      const lock = await tx.workflow.updateMany({
        where: {
          id: workflowId,
          workspaceId,
          deletedAt: null,
          version: input.expectedVersion,
        },
        data: {
          version: { increment: 1 },
        },
      });
      if (lock.count === 0) {
        throw new ConflictException('Workflow has been modified; refresh and retry');
      }

      await tx.workflowDraft.update({
        where: { workflowId },
        data: {
          graphJson: graph as unknown as Prisma.InputJsonValue,
          savedAt: new Date(),
          savedById: userId,
        },
      });

      const row = await tx.workflow.findUniqueOrThrow({ where: { id: workflowId } });

      await this.outbox.append(
        {
          workspaceId,
          aggregateType: 'Workflow',
          aggregateId: workflowId,
          eventType: 'WorkflowUpdated',
          payload: {
            workflowId,
            workspaceId,
            version: row.version,
            changeSummary: `rollback_to_${String(target.versionNumber)}`,
            updatedBy: userId,
          },
        },
        tx,
      );

      return {
        ...this.toSummary(row),
        graph,
        rolledBackFromVersionId: target.id,
      };
    });
  }

  async listVersions(workspaceId: string, workflowId: string) {
    await this.requireWorkflow(workspaceId, workflowId);
    const versions = await this.prisma.workflowVersion.findMany({
      where: { workflowId, workspaceId },
      orderBy: { versionNumber: 'desc' },
    });
    return versions.map((v) => this.toVersionSummary(v));
  }

  async getVersion(workspaceId: string, workflowId: string, versionId: string) {
    await this.requireWorkflow(workspaceId, workflowId);
    const version = await this.prisma.workflowVersion.findFirst({
      where: { id: versionId, workflowId, workspaceId },
      include: {
        nodes: true,
        connections: true,
        variables: true,
      },
    });
    if (!version) {
      throw new NotFoundException('Version not found');
    }
    return {
      ...this.toVersionSummary(version),
      graph: version.graphJson as WorkflowGraph,
      nodes: version.nodes,
      connections: version.connections,
      variables: version.variables,
    };
  }

  async duplicate(workspaceId: string, workflowId: string, userId: string, name?: string) {
    const source = await this.get(workspaceId, workflowId);
    return this.create(workspaceId, userId, {
      name: name?.trim() || `${source.name} (copy)`,
      description: source.description ?? undefined,
      graph: source.graph,
    });
  }

  async getCreatedBy(workspaceId: string, workflowId: string): Promise<string | null> {
    const row = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId, deletedAt: null },
      select: { createdByUserId: true },
    });
    return row?.createdByUserId ?? null;
  }

  private async requireWorkflow(workspaceId: string, workflowId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId, deletedAt: null },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    return workflow;
  }

  private parseGraph(raw: unknown): WorkflowGraph {
    const parsed = workflowGraphSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid workflow graph',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    return parsed.data;
  }

  private hashGraph(graph: WorkflowGraph): string {
    const canonical = JSON.stringify(graph);
    return createHash('sha256').update(canonical).digest('hex');
  }

  private async materializeGraph(tx: Tx, versionId: string, graph: WorkflowGraph) {
    const nodeIds = new Map<string, string>();

    for (const node of graph.nodes) {
      const def = resolveNodeType(node.typeKey);
      const created = await tx.workflowNode.create({
        data: {
          versionId,
          nodeKey: node.key,
          nodeType: def?.nodeType ?? WorkflowNodeType.action,
          typeKey: node.typeKey,
          label: node.label,
          config: node.config as Prisma.InputJsonValue,
          position: { x: node.position.x, y: node.position.y },
        },
      });
      nodeIds.set(node.key, created.id);
    }

    for (const edge of graph.connections) {
      const sourceNodeId = nodeIds.get(edge.sourceKey);
      const targetNodeId = nodeIds.get(edge.targetKey);
      if (!sourceNodeId || !targetNodeId) {
        continue;
      }
      await tx.workflowConnection.create({
        data: {
          versionId,
          sourceNodeId,
          targetNodeId,
          sourcePort: edge.sourcePort,
          targetPort: edge.targetPort,
        },
      });
    }

    for (const variable of graph.variables) {
      await tx.workflowVariable.create({
        data: {
          versionId,
          key: variable.key,
          value: variable.value,
          description: variable.description ?? null,
        },
      });
    }
  }

  private toSummary(workflow: {
    id: string;
    workspaceId: string;
    name: string;
    description: string | null;
    status: WorkflowStatus;
    isTemplate: boolean;
    version: number;
    publishedVersionId: string | null;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: workflow.id,
      workspaceId: workflow.workspaceId,
      name: workflow.name,
      description: workflow.description,
      status: workflow.status,
      isTemplate: workflow.isTemplate,
      version: workflow.version,
      publishedVersionId: workflow.publishedVersionId,
      createdByUserId: workflow.createdByUserId,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
    };
  }

  private toVersionSummary(version: {
    id: string;
    workflowId: string;
    versionNumber: number;
    changelog: string | null;
    snapshotHash: string;
    publishedById: string;
    publishedAt: Date;
    createdAt: Date;
  }) {
    return {
      id: version.id,
      workflowId: version.workflowId,
      versionNumber: version.versionNumber,
      changelog: version.changelog,
      snapshotHash: version.snapshotHash,
      publishedById: version.publishedById,
      publishedAt: version.publishedAt.toISOString(),
      createdAt: version.createdAt.toISOString(),
    };
  }
}
