-- Per-user overrides for cleanup and budget
ALTER TABLE azure_users
  ADD COLUMN IF NOT EXISTS cleanup_disabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cleanup_interval_override INTEGER,
  ADD COLUMN IF NOT EXISTS budget_top_up_usd NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_renewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS budget_renewed_count INTEGER DEFAULT 0;

-- Budget spend cache (refreshed periodically from Azure Cost Management)
CREATE TABLE IF NOT EXISTS user_budget_spend (
  id SERIAL PRIMARY KEY,
  azure_user_id INTEGER NOT NULL REFERENCES azure_users(id) ON DELETE CASCADE,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  current_spend NUMERIC(10, 2) DEFAULT 0,
  budget_amount NUMERIC(10, 2),
  currency TEXT DEFAULT 'USD',
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (azure_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_budget_spend_request
  ON user_budget_spend (request_id);
