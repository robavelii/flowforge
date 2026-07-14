-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('draft', 'published', 'unpublished');

-- CreateEnum
CREATE TYPE "WorkflowNodeType" AS ENUM ('trigger', 'action', 'condition', 'delay', 'loop');

-- CreateTable
CREATE TABLE "workflows" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'draft',
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_version_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_drafts" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "graph_json" JSONB NOT NULL,
    "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saved_by_id" UUID,

    CONSTRAINT "workflow_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "changelog" TEXT,
    "snapshot_hash" VARCHAR(64) NOT NULL,
    "graph_json" JSONB NOT NULL,
    "published_by_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_nodes" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "node_key" VARCHAR(128) NOT NULL,
    "node_type" "WorkflowNodeType" NOT NULL,
    "type_key" VARCHAR(128) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "position" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_connections" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "source_node_id" UUID NOT NULL,
    "source_port" VARCHAR(64) NOT NULL DEFAULT 'out',
    "target_node_id" UUID NOT NULL,
    "target_port" VARCHAR(64) NOT NULL DEFAULT 'in',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_variables" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "workflow_variables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "color" VARCHAR(16),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_tags" (
    "workflow_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "workflow_tags_pkey" PRIMARY KEY ("workflow_id","tag_id")
);

-- CreateTable
CREATE TABLE "search_documents" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" UUID NOT NULL,
    "title" VARCHAR(512) NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "search_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflows_workspace_id_deleted_at_updated_at_idx" ON "workflows"("workspace_id", "deleted_at", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "workflows_workspace_id_status_idx" ON "workflows"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_drafts_workflow_id_key" ON "workflow_drafts"("workflow_id");

-- CreateIndex
CREATE INDEX "workflow_versions_workspace_id_workflow_id_idx" ON "workflow_versions"("workspace_id", "workflow_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_versions_workflow_id_version_number_key" ON "workflow_versions"("workflow_id", "version_number");

-- CreateIndex
CREATE INDEX "workflow_nodes_version_id_idx" ON "workflow_nodes"("version_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_nodes_version_id_node_key_key" ON "workflow_nodes"("version_id", "node_key");

-- CreateIndex
CREATE INDEX "workflow_connections_version_id_idx" ON "workflow_connections"("version_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_variables_version_id_key_key" ON "workflow_variables"("version_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "tags_workspace_id_name_key" ON "tags"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "search_documents_workspace_id_entity_type_idx" ON "search_documents"("workspace_id", "entity_type");

-- CreateIndex
CREATE UNIQUE INDEX "search_documents_workspace_id_entity_type_entity_id_key" ON "search_documents"("workspace_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_drafts" ADD CONSTRAINT "workflow_drafts_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_drafts" ADD CONSTRAINT "workflow_drafts_saved_by_id_fkey" FOREIGN KEY ("saved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_connections" ADD CONSTRAINT "workflow_connections_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_connections" ADD CONSTRAINT "workflow_connections_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "workflow_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_connections" ADD CONSTRAINT "workflow_connections_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "workflow_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_variables" ADD CONSTRAINT "workflow_variables_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tags" ADD CONSTRAINT "workflow_tags_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tags" ADD CONSTRAINT "workflow_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
