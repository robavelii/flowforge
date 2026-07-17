import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'test', 'production', 'staging']);

export const baseConfigSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_NAME: z.string().default('flowforge'),
  APP_VERSION: z.string().default('0.1.0'),
});

export const databaseConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
});

export const redisConfigSchema = z.object({
  REDIS_URL: z.string().url(),
});

export const minioConfigSchema = z.object({
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(1).default('flowforge'),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export const apiConfigSchema = baseConfigSchema
  .merge(databaseConfigSchema)
  .merge(redisConfigSchema)
  .merge(minioConfigSchema)
  .extend({
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    API_PREFIX: z.string().default('api'),
    CORS_ORIGINS: z
      .string()
      .default('*')
      .transform((v) => v.split(',').map((s) => s.trim())),
    JWT_SECRET: z
      .string()
      .min(32)
      .default('flowforge-dev-jwt-secret-change-me-min-32-chars'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    SECRETS_ENCRYPTION_KEY: z
      .string()
      .min(32)
      .default('flowforge-dev-secrets-encryption-key-32b'),
    APP_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    EMAIL_FROM: z.string().email().default('noreply@flowforge.local'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    FILE_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    OTEL_SERVICE_NAME: z.string().default('flowforge-api'),
  });

export const workerConfigSchema = baseConfigSchema
  .merge(databaseConfigSchema)
  .merge(redisConfigSchema)
  .extend({
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
    SECRETS_ENCRYPTION_KEY: z
      .string()
      .min(32)
      .default('flowforge-dev-secrets-encryption-key-32b'),
    EMAIL_FROM: z.string().email().default('noreply@flowforge.local'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    OTEL_SERVICE_NAME: z.string().default('flowforge-worker'),
  });

export type BaseConfig = z.infer<typeof baseConfigSchema>;
export type ApiConfig = z.infer<typeof apiConfigSchema>;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export type ConfigValidationError = {
  field: string;
  message: string;
};

export function formatZodErrors(error: z.ZodError): ConfigValidationError[] {
  return error.errors.map((e) => ({
    field: e.path.join('.'),
    message: e.message,
  }));
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const result = apiConfigSchema.safeParse(env);
  if (!result.success) {
    const errors = formatZodErrors(result.error);
    throw new Error(`Invalid API configuration:\n${JSON.stringify(errors, null, 2)}`);
  }
  return result.data;
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const result = workerConfigSchema.safeParse(env);
  if (!result.success) {
    const errors = formatZodErrors(result.error);
    throw new Error(`Invalid worker configuration:\n${JSON.stringify(errors, null, 2)}`);
  }
  return result.data;
}
