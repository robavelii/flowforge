import { z } from 'zod';
import { isKnownNodeTypeKey } from './node-registry';

export const graphNodeSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'Node key must be alphanumeric with _ or -'),
  typeKey: z.string().min(1).max(128),
  label: z.string().min(1).max(255),
  config: z.record(z.string(), z.unknown()).default({}),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .default({ x: 0, y: 0 }),
});

export const graphConnectionSchema = z.object({
  sourceKey: z.string().min(1).max(128),
  sourcePort: z.string().min(1).max(64).default('out'),
  targetKey: z.string().min(1).max(128),
  targetPort: z.string().min(1).max(64).default('in'),
});

export const graphVariableSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Variable key must be a valid identifier'),
  value: z.string().max(10_000),
  description: z.string().max(1000).optional(),
});

export const workflowGraphSchema = z
  .object({
    nodes: z.array(graphNodeSchema).max(200),
    connections: z.array(graphConnectionSchema).max(500),
    variables: z.array(graphVariableSchema).max(100).default([]),
  })
  .superRefine((graph, ctx) => {
    const keys = new Set<string>();
    for (const [i, node] of graph.nodes.entries()) {
      if (keys.has(node.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate node key: ${node.key}`,
          path: ['nodes', i, 'key'],
        });
      }
      keys.add(node.key);

      if (!isKnownNodeTypeKey(node.typeKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown node type: ${node.typeKey}`,
          path: ['nodes', i, 'typeKey'],
        });
      }
    }

    for (const [i, edge] of graph.connections.entries()) {
      if (!keys.has(edge.sourceKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown source node: ${edge.sourceKey}`,
          path: ['connections', i, 'sourceKey'],
        });
      }
      if (!keys.has(edge.targetKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown target node: ${edge.targetKey}`,
          path: ['connections', i, 'targetKey'],
        });
      }
      if (edge.sourceKey === edge.targetKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Self-connections are not allowed',
          path: ['connections', i],
        });
      }
    }

    const varKeys = new Set<string>();
    for (const [i, variable] of graph.variables.entries()) {
      if (varKeys.has(variable.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate variable key: ${variable.key}`,
          path: ['variables', i, 'key'],
        });
      }
      varKeys.add(variable.key);
    }

    const triggers = graph.nodes.filter((n) => n.typeKey.startsWith('trigger.'));
    if (graph.nodes.length > 0 && triggers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Graph must include at least one trigger node when nodes are present',
        path: ['nodes'],
      });
    }
  });

export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;

export const EMPTY_GRAPH: WorkflowGraph = {
  nodes: [],
  connections: [],
  variables: [],
};
