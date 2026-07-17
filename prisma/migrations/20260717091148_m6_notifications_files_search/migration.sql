-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'slack', 'webhook');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "FileScanStatus" AS ENUM ('pending', 'clean', 'infected', 'skipped');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('pending_upload', 'ready', 'deleted');

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subject" VARCHAR(255),
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "user_id" UUID,
    "template_id" UUID,
    "template_key" VARCHAR(64) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "recipient" VARCHAR(512) NOT NULL,
    "subject" VARCHAR(255),
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "error_message" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "uploaded_by_id" UUID,
    "filename" VARCHAR(512) NOT NULL,
    "content_type" VARCHAR(255) NOT NULL,
    "size_bytes" BIGINT,
    "storage_key" VARCHAR(1024) NOT NULL,
    "checksum_sha256" VARCHAR(64),
    "scan_status" "FileScanStatus" NOT NULL DEFAULT 'pending',
    "status" "FileStatus" NOT NULL DEFAULT 'pending_upload',
    "confirmed_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_key_channel_key" ON "notification_templates"("key", "channel");

-- CreateIndex
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE INDEX "notification_preferences_workspace_id_idx" ON "notification_preferences"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_channel_event_type_key" ON "notification_preferences"("user_id", "channel", "event_type");

-- CreateIndex
CREATE INDEX "notifications_workspace_id_created_at_idx" ON "notifications"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "files_workspace_id_deleted_at_created_at_idx" ON "files"("workspace_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "files_storage_key_idx" ON "files"("storage_key");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Full-text search vector + GIN index (M6)
ALTER TABLE "search_documents"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS "search_documents_search_vector_idx"
  ON "search_documents" USING GIN ("search_vector");

-- Seed system notification templates
INSERT INTO "notification_templates" ("id", "key", "channel", "subject", "body", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'welcome', 'email', 'Welcome to FlowForge',
   'Hi {{name}},\n\nWelcome to FlowForge! Your account ({{email}}) is ready.\n\n— The FlowForge team',
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'invitation', 'email', 'You''re invited to {{workspaceName}}',
   'Hi,\n\nYou''ve been invited to join workspace "{{workspaceName}}" as {{role}}.\n\nAccept with token: {{token}}\n\n— FlowForge',
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'execution_failure', 'email', 'Workflow execution failed',
   'A workflow execution failed in workspace {{workspaceId}}.\n\nExecution: {{executionId}}\nWorkflow: {{workflowId}}\nError: {{errorMessage}}\n\n— FlowForge',
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'execution_failure', 'slack', NULL,
   '{"text":"Execution {{executionId}} failed for workflow {{workflowId}}: {{errorMessage}}"}',
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key", "channel") DO NOTHING;
