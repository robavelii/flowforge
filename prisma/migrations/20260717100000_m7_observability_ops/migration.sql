-- M7: retention and read-path indexes for observability/performance operations.

CREATE INDEX IF NOT EXISTS "outbox_events_workspace_published_at_idx"
  ON "outbox_events" ("workspace_id", "published_at")
  WHERE "published_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "inbox_events_workspace_processed_at_idx"
  ON "inbox_events" ("workspace_id", "processed_at");

CREATE INDEX IF NOT EXISTS "idempotency_records_workspace_expires_at_idx"
  ON "idempotency_records" ("workspace_id", "expires_at");

CREATE INDEX IF NOT EXISTS "workflow_executions_workspace_created_at_idx"
  ON "workflow_executions" ("workspace_id", "created_at" DESC);
