import { nextReadyNodes, type WorkflowGraph } from '../src/index';

describe('DAG traversal', () => {
  const graph: WorkflowGraph = {
    nodes: [
      {
        key: 't',
        typeKey: 'trigger.manual',
        label: 'T',
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        key: 'a',
        typeKey: 'action.http',
        label: 'A',
        config: {},
        position: { x: 1, y: 0 },
      },
      {
        key: 'b',
        typeKey: 'action.http',
        label: 'B',
        config: {},
        position: { x: 2, y: 0 },
      },
    ],
    connections: [
      { sourceKey: 't', sourcePort: 'out', targetKey: 'a', targetPort: 'in' },
      { sourceKey: 'a', sourcePort: 'out', targetKey: 'b', targetPort: 'in' },
    ],
    variables: [],
  };

  it('starts with trigger then walks linearly', () => {
    const ports = new Map<string, Set<string>>();
    const first = nextReadyNodes(graph, new Set(), new Set(), ports);
    expect(first.map((n) => n.key)).toEqual(['t']);

    const second = nextReadyNodes(graph, new Set(['t']), new Set(), ports);
    expect(second.map((n) => n.key)).toEqual(['a']);

    const third = nextReadyNodes(graph, new Set(['t', 'a']), new Set(), ports);
    expect(third.map((n) => n.key)).toEqual(['b']);
  });
});
