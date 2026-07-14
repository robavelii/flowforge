-- CreateEnum
CREATE TYPE "AbacEffect" AS ENUM ('allow', 'deny');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('active', 'revoked', 'expired');

-- AlterTable
ALTER TABLE "invitations" ALTER COLUMN "role" SET DEFAULT 'viewer';

-- AlterTable
ALTER TABLE "workspace_members" ADD COLUMN     "role_id" UUID;

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "name" VARCHAR(128) NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_roles" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "member_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abac_policies" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "effect" "AbacEffect" NOT NULL,
    "permissions" JSONB NOT NULL,
    "conditions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "abac_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "key_prefix" VARCHAR(16) NOT NULL,
    "key_hash" VARCHAR(128) NOT NULL,
    "scopes" JSONB NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'active',
    "created_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "actor_user_id" UUID,
    "actor_api_key_id" UUID,
    "action" VARCHAR(128) NOT NULL,
    "resource_type" VARCHAR(64) NOT NULL,
    "resource_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "correlation_id" VARCHAR(128),
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "event_type" VARCHAR(128) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "summary" TEXT,
    "resource_type" VARCHAR(64),
    "resource_id" UUID,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "actor_key" VARCHAR(128) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "method" VARCHAR(16) NOT NULL,
    "path" VARCHAR(512) NOT NULL,
    "request_hash" VARCHAR(128),
    "status_code" INTEGER NOT NULL,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "roles_workspace_id_idx" ON "roles"("workspace_id");

-- CreateIndex
CREATE INDEX "roles_is_system_idx" ON "roles"("is_system");

-- CreateIndex
CREATE UNIQUE INDEX "roles_workspace_id_slug_key" ON "roles"("workspace_id", "slug");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "member_roles_role_id_idx" ON "member_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_roles_member_id_role_id_key" ON "member_roles"("member_id", "role_id");

-- CreateIndex
CREATE INDEX "abac_policies_workspace_id_idx" ON "abac_policies"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_workspace_id_idx" ON "api_keys"("workspace_id");

-- CreateIndex
CREATE INDEX "api_keys_created_by_user_id_idx" ON "api_keys"("created_by_user_id");

-- CreateIndex
CREATE INDEX "api_keys_status_idx" ON "api_keys"("status");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "timeline_events_workspace_id_occurred_at_idx" ON "timeline_events"("workspace_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idempotency_records_workspace_id_idx" ON "idempotency_records"("workspace_id");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_actor_key_key_key" ON "idempotency_records"("actor_key", "key");

-- CreateIndex
CREATE INDEX "workspace_members_role_id_idx" ON "workspace_members"("role_id");

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "workspace_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abac_policies" ADD CONSTRAINT "abac_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_api_key_id_fkey" FOREIGN KEY ("actor_api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
