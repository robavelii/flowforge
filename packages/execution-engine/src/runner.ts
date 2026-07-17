import {
  ExecutionStatus,
  ExecutionStepStatus,
  type PrismaClient,
  type Prisma,
} from '@prisma/client';
import { nextReadyNodes } from './dag.js';
import { executeNode } from './executors/index.js';
import type { ExecutionContext, WorkflowGraph } from './types.js';

export type RunExecutionOptions = {
  prisma: PrismaClient;
  executionId: string;
  /** Called periodically; return true to abort as cancelled */
  shouldCancel?: () => Promise<boolean>;
  onCheckpoint?: (checkpoint: Record<string, unknown>) => Promise<void>;
};

export async function runExecution(options: RunExecutionOptions): Promise<ExecutionStatus> {
  const { prisma, executionId } = options;

  const execution = await prisma.workflowExecution.findUnique({
    where: { id: executionId },
    include: {
      workflowVersion: {
        include: { nodes: true },
      },
    },
  });

  if (!execution) {
    throw new Error(`Execution not found: ${executionId}`);
  }

  if (
    execution.status === ExecutionStatus.completed ||
    execution.status === ExecutionStatus.cancelled
  ) {
    return execution.status;
  }

  if (execution.status === ExecutionStatus.failed && !execution.checkpoint) {
    return execution.status;
  }

  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: ExecutionStatus.running,
      startedAt: execution.startedAt ?? new Date(),
    },
  });

  await prisma.executionLog.create({
    data: {
      executionId,
      level: 'info',
      message: 'Execution started',
    },
  });

  const graph = execution.workflowVersion.graphJson as unknown as WorkflowGraph;
  const nodesByDbKey = new Map(
    execution.workflowVersion.nodes.map((n) => [n.nodeKey, n] as const),
  );

  const ctx: ExecutionContext = {
    executionId,
    workspaceId: execution.workspaceId,
    sandbox: execution.sandbox,
    triggerPayload: (execution.triggerPayload as Record<string, unknown>) ?? {},
    variables: Object.fromEntries(
      (graph.variables ?? []).map((v) => [v.key, v.value]),
    ),
    nodeOutputs: {},
  };

  const completed = new Set<string>();
  const skipped = new Set<string>();
  const allowedPorts = new Map<string, Set<string>>();
  let sequence = 0;
  const startedAt = Date.now();

  try {
    while (true) {
      if (options.shouldCancel && (await options.shouldCancel())) {
        await finalize(prisma, executionId, ExecutionStatus.cancelled, startedAt, 'Cancelled');
        return ExecutionStatus.cancelled;
      }

      const ready = nextReadyNodes(graph, completed, skipped, allowedPorts).filter(
        (n) => !completed.has(n.key) && !skipped.has(n.key),
      );

      if (ready.length === 0) {
        break;
      }

      for (const node of ready) {
        if (options.shouldCancel && (await options.shouldCancel())) {
          await finalize(prisma, executionId, ExecutionStatus.cancelled, startedAt, 'Cancelled');
          return ExecutionStatus.cancelled;
        }

        sequence += 1;
        const dbNode = nodesByDbKey.get(node.key);
        const step = await prisma.executionStep.create({
          data: {
            workspaceId: execution.workspaceId,
            executionId,
            nodeId: dbNode?.id ?? null,
            nodeKey: node.key,
            sequenceNumber: sequence,
            status: ExecutionStepStatus.running,
            attemptNumber: 1,
            inputPayload: {
              config: node.config,
              variables: ctx.variables,
            } as Prisma.InputJsonValue,
            startedAt: new Date(),
          },
        });

        const retryPolicy = Number(
          (node.config['retries'] as number | undefined) ??
            (node.typeKey === 'action.http' ? 2 : 0),
        );
        let attempt = 1;
        let result = await executeNode(node, ctx);

        while (result.status === 'failed' && attempt <= retryPolicy) {
          attempt += 1;
          await prisma.executionLog.create({
            data: {
              executionId,
              stepId: step.id,
              level: 'warn',
              message: `Retrying ${node.key} attempt ${String(attempt)}`,
              context: { error: result.errorMessage },
            },
          });
          await sleep(50 * 2 ** (attempt - 2));
          result = await executeNode(node, ctx);
          await prisma.executionStep.create({
            data: {
              workspaceId: execution.workspaceId,
              executionId,
              nodeId: dbNode?.id ?? null,
              nodeKey: node.key,
              sequenceNumber: sequence,
              status:
                result.status === 'completed'
                  ? ExecutionStepStatus.completed
                  : ExecutionStepStatus.failed,
              attemptNumber: attempt,
              inputPayload: { config: node.config } as Prisma.InputJsonValue,
              outputPayload: (result.output ?? null) as Prisma.InputJsonValue,
              errorCode: result.errorCode ?? null,
              errorMessage: result.errorMessage ?? null,
              startedAt: new Date(),
              completedAt: new Date(),
            },
          });
        }

        if (result.status === 'failed' && attempt === 1) {
          await prisma.executionStep.update({
            where: { id: step.id },
            data: {
              status: ExecutionStepStatus.failed,
              outputPayload: (result.output ?? null) as Prisma.InputJsonValue,
              errorCode: result.errorCode ?? null,
              errorMessage: result.errorMessage ?? null,
              completedAt: new Date(),
              attemptNumber: attempt,
            },
          });
        } else if (result.status !== 'failed') {
          await prisma.executionStep.update({
            where: { id: step.id },
            data: {
              status:
                result.status === 'skipped'
                  ? ExecutionStepStatus.skipped
                  : ExecutionStepStatus.completed,
              outputPayload: (result.output ?? {}) as Prisma.InputJsonValue,
              completedAt: new Date(),
              attemptNumber: attempt,
            },
          });
        }

        await prisma.executionLog.create({
          data: {
            executionId,
            stepId: step.id,
            level: result.status === 'failed' ? 'error' : 'info',
            message: `Node ${node.key} ${result.status}`,
            context: {
              typeKey: node.typeKey,
              error: result.errorMessage ?? null,
            },
          },
        });

        if (result.status === 'failed') {
          await finalize(
            prisma,
            executionId,
            ExecutionStatus.failed,
            startedAt,
            result.errorMessage ?? 'Node failed',
            result.errorCode,
          );
          return ExecutionStatus.failed;
        }

        completed.add(node.key);
        if (result.output) {
          ctx.nodeOutputs[node.key] = result.output;
        }
        if (result.takePorts && result.takePorts.length > 0) {
          allowedPorts.set(node.key, new Set(result.takePorts));
        }

        // Mark unreachable branch children as skipped later via port filtering

        if (options.onCheckpoint) {
          await options.onCheckpoint({
            completed: [...completed],
            skipped: [...skipped],
            sequence,
          });
        }

        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            checkpoint: {
              completed: [...completed],
              skipped: [...skipped],
              sequence,
            },
            version: { increment: 1 },
          },
        });
      }
    }

    await finalize(prisma, executionId, ExecutionStatus.completed, startedAt);
    return ExecutionStatus.completed;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Execution crashed';
    await finalize(prisma, executionId, ExecutionStatus.failed, startedAt, message, 'CRASH');
    throw err;
  }
}

async function finalize(
  prisma: PrismaClient,
  executionId: string,
  status: ExecutionStatus,
  startedAtMs: number,
  errorMessage?: string,
  errorCode?: string,
): Promise<void> {
  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: {
      status,
      completedAt: new Date(),
      errorMessage: errorMessage !== undefined ? errorMessage : null,
      errorCode: errorCode !== undefined ? errorCode : null,
    },
  });

  await prisma.executionMetric.create({
    data: {
      executionId,
      metricName: 'duration_ms',
      value: Date.now() - startedAtMs,
      unit: 'ms',
    },
  });

  await prisma.executionMetric.create({
    data: {
      executionId,
      metricName: 'status',
      value: status === ExecutionStatus.completed ? 1 : 0,
      unit: 'bool',
    },
  });

  await prisma.executionLog.create({
    data: {
      executionId,
      level: status === ExecutionStatus.completed ? 'info' : 'warn',
      message: `Execution ${status}`,
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
