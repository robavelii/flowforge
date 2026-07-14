export type GraphNode = {
  key: string;
  typeKey: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
};

export type GraphConnection = {
  sourceKey: string;
  sourcePort: string;
  targetKey: string;
  targetPort: string;
};

export type WorkflowGraph = {
  nodes: GraphNode[];
  connections: GraphConnection[];
  variables: Array<{ key: string; value: string; description?: string }>;
};

export type NodeExecutionResult = {
  status: 'completed' | 'failed' | 'skipped';
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  /** For condition nodes: which output port(s) to follow */
  takePorts?: string[];
};

export type ExecutionContext = {
  executionId: string;
  workspaceId: string;
  sandbox: boolean;
  triggerPayload: Record<string, unknown>;
  variables: Record<string, string>;
  nodeOutputs: Record<string, Record<string, unknown>>;
};
