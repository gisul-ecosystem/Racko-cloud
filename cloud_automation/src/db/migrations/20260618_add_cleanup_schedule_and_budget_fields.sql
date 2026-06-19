-- Scheduled cleanup fields on provisioning requests
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS cleanup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cleanup_interval_hours INTEGER,
  ADD COLUMN IF NOT EXISTS last_cleanup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_cleanup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS per_user_budget_usd NUMERIC(10, 2);

-- Per-user Azure budget tracking
ALTER TABLE azure_users
  ADD COLUMN IF NOT EXISTS budget_id TEXT,
  ADD COLUMN IF NOT EXISTS budget_exceeded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS budget_exceeded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS budget_exceeded_events (
  id BIGSERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES azure_users(id) ON DELETE SET NULL,
  azure_user_id TEXT,
  resource_group_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_exceeded_events_request_id
  ON budget_exceeded_events (request_id);

CREATE INDEX IF NOT EXISTS idx_requests_scheduled_cleanup
  ON requests (next_cleanup_at)
  WHERE cleanup_enabled = TRUE;

COMMENT ON COLUMN requests.cleanup_enabled IS 'When true, recurring cleanup runs at cleanup_interval_hours';
COMMENT ON COLUMN requests.per_user_budget_usd IS 'Optional USD budget per user; triggers alert and account suspension when exceeded';
