import type { GraphConnection, GraphNode, WorkflowGraph } from './types.js';

export function buildAdjacency(graph: WorkflowGraph): {
  nodesByKey: Map<string, GraphNode>;
  outgoing: Map<string, GraphConnection[]>;
  indegree: Map<string, number>;
  triggers: GraphNode[];
} {
  const nodesByKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const outgoing = new Map<string, GraphConnection[]>();
  const indegree = new Map<string, number>();

  for (const node of graph.nodes) {
    outgoing.set(node.key, []);
    indegree.set(node.key, 0);
  }

  for (const edge of graph.connections) {
    if (!nodesByKey.has(edge.sourceKey) || !nodesByKey.has(edge.targetKey)) {
      continue;
    }
    outgoing.get(edge.sourceKey)?.push(edge);
    indegree.set(edge.targetKey, (indegree.get(edge.targetKey) ?? 0) + 1);
  }

  const triggers = graph.nodes.filter((n) => n.typeKey.startsWith('trigger.'));
  return { nodesByKey, outgoing, indegree, triggers };
}

/** Kahn-style ready set: start from triggers, advance by completed edges. */
export function nextReadyNodes(
  graph: WorkflowGraph,
  completed: Set<string>,
  skipped: Set<string>,
  allowedPorts: Map<string, Set<string>>,
): GraphNode[] {
  const { nodesByKey, outgoing } = buildAdjacency(graph);
  const done = new Set([...completed, ...skipped]);
  const ready: GraphNode[] = [];

  for (const node of graph.nodes) {
    if (done.has(node.key)) {
      continue;
    }

    if (node.typeKey.startsWith('trigger.')) {
      ready.push(node);
      continue;
    }

    const incoming = graph.connections.filter((c) => c.targetKey === node.key);
    if (incoming.length === 0) {
      continue;
    }

    const parentsSatisfied = incoming.every((edge) => {
      if (!done.has(edge.sourceKey)) {
        return false;
      }
      if (skipped.has(edge.sourceKey)) {
        return false;
      }
      const ports = allowedPorts.get(edge.sourceKey);
      if (ports && ports.size > 0 && !ports.has(edge.sourcePort)) {
        return false;
      }
      return true;
    });

    if (parentsSatisfied) {
      const n = nodesByKey.get(node.key);
      if (n) {
        ready.push(n);
      }
    }
  }

  // Prefer topological stability: nodes whose deps are deeper first by connection order
  void outgoing;
  return ready;
}
