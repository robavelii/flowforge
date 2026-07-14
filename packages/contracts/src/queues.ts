/** BullMQ queue names (see docs/architecture/QUEUE-DESIGN.md) */
export const QUEUES = {
  WORKFLOW_EXECUTION: 'workflow.execution',
  WORKFLOW_EXECUTION_PRIORITY: 'workflow.execution.priority',
  WORKFLOW_EXECUTION_DELAYED: 'workflow.execution.delayed',
} as const;

export type ExecutionJobPayload = {
  executionId: string;
  workspaceId: string;
  workflowId: string;
  workflowVersionId: string;
  sandbox: boolean;
};
