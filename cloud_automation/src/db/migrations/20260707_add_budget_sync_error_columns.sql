ALTER TABLE user_budget_spend
  ADD COLUMN IF NOT EXISTS sync_error TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_attempted_at TIMESTAMPTZ;

ALTER TABLE resource_cleanup_logs
  ADD COLUMN IF NOT EXISTS triggered_by TEXT DEFAULT 'scheduler',
  ADD COLUMN IF NOT EXISTS total_deleted INTEGER;
