import { z } from 'zod';

/** RFC 7807 Problem Details */
export const problemDetailsSchema = z.object({
  type: z.string().url().optional(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z
    .array(
      z.object({
        field: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

/** Cursor pagination request */
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CursorPagination = z.infer<typeof cursorPaginationSchema>;

/** Cursor pagination response metadata */
export const cursorPageMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  hasMore: z.boolean(),
  total: z.number().int().optional(),
});

export type CursorPageMeta = z.infer<typeof cursorPageMetaSchema>;

/** Health check response */
export const healthCheckSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string().datetime(),
  version: z.string(),
  uptime: z.number(),
  checks: z.record(
    z.object({
      status: z.enum(['up', 'down']),
      latencyMs: z.number().optional(),
      message: z.string().optional(),
    }),
  ),
});

export type HealthCheck = z.infer<typeof healthCheckSchema>;
