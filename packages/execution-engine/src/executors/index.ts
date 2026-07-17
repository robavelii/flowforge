import type { ExecutionContext, GraphNode, NodeExecutionResult } from '../types.js';
import { CircuitBreaker } from '../circuit-breaker.js';

const circuit = new CircuitBreaker();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(config: Record<string, unknown>): Record<string, unknown> {
  return config;
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return fallback;
}

export async function executeNode(
  node: GraphNode,
  ctx: ExecutionContext,
): Promise<NodeExecutionResult> {
  const config = asRecord(node.config);

  if (node.typeKey.startsWith('trigger.')) {
    return {
      status: 'completed',
      output: {
        triggerType: node.typeKey,
        payload: ctx.triggerPayload,
      },
    };
  }

  if (node.typeKey === 'action.set_variable') {
    const key = asString(config['key']);
    const value = asString(config['value']);
    if (!key) {
      return {
        status: 'failed',
        errorCode: 'INVALID_CONFIG',
        errorMessage: 'Missing variable key',
      };
    }
    ctx.variables[key] = value;
    return { status: 'completed', output: { key, value } };
  }

  if (node.typeKey === 'action.http') {
    return executeHttp(node, ctx, config);
  }

  if (node.typeKey === 'condition.if') {
    const left = resolveExpr(asString(config['left']), ctx);
    const op = asString(config['operator'], 'eq');
    const right = resolveExpr(asString(config['right']), ctx);
    const ok = compare(left, op, right);
    return {
      status: 'completed',
      output: { result: ok, left, right, operator: op },
      takePorts: ok ? ['true', 'out'] : ['false'],
    };
  }

  if (node.typeKey === 'delay.wait') {
    const msRaw = Number(config['ms'] ?? config['durationMs'] ?? 0);
    const maxMs = ctx.sandbox ? 2_000 : 60_000;
    const ms = Math.min(Math.max(0, msRaw), maxMs);
    await sleep(ms);
    return { status: 'completed', output: { waitedMs: ms } };
  }

  if (node.typeKey === 'loop.foreach') {
    const items = Array.isArray(config['items']) ? (config['items'] as unknown[]) : [];
    return {
      status: 'completed',
      output: { iterations: items.length, items: ctx.sandbox ? items.slice(0, 10) : items },
      takePorts: ['out'],
    };
  }

  return {
    status: 'failed',
    errorCode: 'UNKNOWN_NODE',
    errorMessage: `No executor for ${node.typeKey}`,
  };
}

async function executeHttp(
  node: GraphNode,
  ctx: ExecutionContext,
  config: Record<string, unknown>,
): Promise<NodeExecutionResult> {
  const url = asString(config['url']);
  const method = asString(config['method'], 'GET').toUpperCase();
  if (!url) {
    return { status: 'failed', errorCode: 'INVALID_CONFIG', errorMessage: 'Missing url' };
  }

  if (ctx.sandbox) {
    // Sandbox: never call the network (M8 will add selective real-side-effect modes)
    return {
      status: 'completed',
      output: {
        mocked: true,
        status: 200,
        body: { ok: true, node: node.key },
        url,
        method,
      },
    };
  }

  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    return { status: 'failed', errorCode: 'INVALID_URL', errorMessage: 'Invalid URL' };
  }

  try {
    circuit.assertClosed(host);
  } catch (err) {
    return {
      status: 'failed',
      errorCode: 'CIRCUIT_OPEN',
      errorMessage: err instanceof Error ? err.message : 'Circuit open',
    };
  }

  const maxAttempts = Number(config['retries'] ?? 2) + 1;
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const init: RequestInit = {
        method,
        headers: (config['headers'] as Record<string, string> | undefined) ?? {
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(Number(config['timeoutMs'] ?? 10_000)),
      };
      if (method !== 'GET' && method !== 'HEAD') {
        init.body = JSON.stringify(config['body'] ?? {});
      }
      const response = await fetch(url, init);

      const text = await response.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        /* plain text */
      }

      if (!response.ok) {
        lastError = `HTTP ${String(response.status)}`;
        circuit.recordFailure(host);
        if (attempt < maxAttempts) {
          await sleep(100 * 2 ** (attempt - 1));
          continue;
        }
        return {
          status: 'failed',
          errorCode: 'HTTP_ERROR',
          errorMessage: lastError,
          output: { status: response.status, body },
        };
      }

      circuit.recordSuccess(host);
      return {
        status: 'completed',
        output: { status: response.status, body, headers: Object.fromEntries(response.headers) },
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'HTTP request failed';
      circuit.recordFailure(host);
      if (attempt < maxAttempts) {
        await sleep(100 * 2 ** (attempt - 1));
        continue;
      }
    }
  }

  return { status: 'failed', errorCode: 'HTTP_ERROR', errorMessage: lastError };
}

function resolveExpr(expr: string, ctx: ExecutionContext): string {
  if (expr.startsWith('{{') && expr.endsWith('}}')) {
    const path = expr.slice(2, -2).trim();
    if (path.startsWith('vars.')) {
      return ctx.variables[path.slice(5)] ?? '';
    }
    if (path.startsWith('trigger.')) {
      const key = path.slice(8);
      const v = ctx.triggerPayload[key];
      return v === undefined || v === null ? '' : asString(v);
    }
  }
  return expr;
}

function compare(left: string, op: string, right: string): boolean {
  switch (op) {
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'contains':
      return left.includes(right);
    case 'gt':
      return Number(left) > Number(right);
    case 'lt':
      return Number(left) < Number(right);
    default:
      return left === right;
  }
}
