import { WorkflowNodeType } from '@prisma/client';

export type NodeTypeDefinition = {
  typeKey: string;
  nodeType: WorkflowNodeType;
  label: string;
  description: string;
  /** When true, sandbox executions skip real side effects for this node type */
  supportsDryRun: boolean;
};

/** Extensible registry of supported node type keys (M3/M8). */
export const NODE_TYPE_REGISTRY: readonly NodeTypeDefinition[] = [
  {
    typeKey: 'trigger.manual',
    nodeType: WorkflowNodeType.trigger,
    label: 'Manual trigger',
    description: 'Starts a workflow from a manual or API invoke',
    supportsDryRun: true,
  },
  {
    typeKey: 'trigger.webhook',
    nodeType: WorkflowNodeType.trigger,
    label: 'Webhook trigger',
    description: 'Starts a workflow from an inbound HTTP webhook',
    supportsDryRun: true,
  },
  {
    typeKey: 'trigger.schedule',
    nodeType: WorkflowNodeType.trigger,
    label: 'Schedule trigger',
    description: 'Starts a workflow on a cron schedule',
    supportsDryRun: true,
  },
  {
    typeKey: 'action.http',
    nodeType: WorkflowNodeType.action,
    label: 'HTTP request',
    description: 'Perform an outbound HTTP request',
    supportsDryRun: true,
  },
  {
    typeKey: 'action.set_variable',
    nodeType: WorkflowNodeType.action,
    label: 'Set variable',
    description: 'Write a workflow variable for downstream nodes',
    supportsDryRun: true,
  },
  {
    typeKey: 'condition.if',
    nodeType: WorkflowNodeType.condition,
    label: 'If / else',
    description: 'Branch based on an expression',
    supportsDryRun: true,
  },
  {
    typeKey: 'delay.wait',
    nodeType: WorkflowNodeType.delay,
    label: 'Delay',
    description: 'Wait for a duration before continuing',
    supportsDryRun: true,
  },
  {
    typeKey: 'loop.foreach',
    nodeType: WorkflowNodeType.loop,
    label: 'For each',
    description: 'Iterate over a collection',
    supportsDryRun: true,
  },
] as const;

const BY_KEY = new Map(NODE_TYPE_REGISTRY.map((d) => [d.typeKey, d]));

export function resolveNodeType(typeKey: string): NodeTypeDefinition | undefined {
  return BY_KEY.get(typeKey);
}

export function isKnownNodeTypeKey(typeKey: string): boolean {
  return BY_KEY.has(typeKey);
}
