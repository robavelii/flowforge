-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ExecutionTriggerType" AS ENUM ('manual', 'api', 'schedule', 'webhook', 'replay');

-- CreateEnum
CREATE TYPE "ExecutionStepStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('active', 'paused', 'deleted');

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workflow_version_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'queued',
    "trigger_type" "ExecutionTriggerType" NOT NULL,
    "trigger_payload" JSONB,
    "idempotency_key" VARCHAR(255),
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "started_by_user_id" UUID,
    "replay_of_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "checkpoint" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_steps" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "node_id" UUID,
    "node_key" VARCHAR(128) NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "status" "ExecutionStepStatus" NOT NULL DEFAULT 'pending',
    "input_payload" JSONB,
    "output_payload" JSONB,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_logs" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "step_id" UUID,
    "level" VARCHAR(16) NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "logged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_metrics" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "metric_name" VARCHAR(128) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" VARCHAR(32),
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "workflow_version_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "cron_expression" VARCHAR(128) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "status" "ScheduleStatus" NOT NULL DEFAULT 'active',
    "next_run_at" TIMESTAMPTZ(6),
    "last_run_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_executions_workspace_id_status_created_at_idx" ON "workflow_executions"("workspace_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "workflow_executions_workspace_id_workflow_version_id_idx" ON "workflow_executions"("workspace_id", "workflow_version_id");

-- CreateIndex
CREATE INDEX "workflow_executions_workflow_id_idx" ON "workflow_executions"("workflow_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_executions_workspace_id_idempotency_key_key" ON "workflow_executions"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "execution_steps_execution_id_status_idx" ON "execution_steps"("execution_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "execution_steps_execution_id_sequence_number_attempt_number_key" ON "execution_steps"("execution_id", "sequence_number", "attempt_number");

-- CreateIndex
CREATE INDEX "execution_logs_execution_id_logged_at_idx" ON "execution_logs"("execution_id", "logged_at");

-- CreateIndex
CREATE INDEX "execution_metrics_execution_id_idx" ON "execution_metrics"("execution_id");

-- CreateIndex
CREATE INDEX "schedules_status_next_run_at_idx" ON "schedules"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "schedules_workspace_id_idx" ON "schedules"("workspace_id");

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_version_id_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_started_by_user_id_fkey" FOREIGN KEY ("started_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_replay_of_id_fkey" FOREIGN KEY ("replay_of_id") REFERENCES "workflow_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "workflow_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_logs" ADD CONSTRAINT "execution_logs_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_logs" ADD CONSTRAINT "execution_logs_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "execution_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_metrics" ADD CONSTRAINT "execution_metrics_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workflow_version_id_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
