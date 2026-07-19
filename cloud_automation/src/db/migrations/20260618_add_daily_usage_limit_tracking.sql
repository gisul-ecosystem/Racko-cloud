-- Daily hour limit per usage window + per-user daily consumption tracking

ALTER TABLE request_usage_windows
  ADD COLUMN IF NOT EXISTS daily_limit_hours NUMERIC(4, 2);

CREATE TABLE IF NOT EXISTS daily_usage_tracking (
  id                  SERIAL PRIMARY KEY,
  request_id          INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  azure_user_id       INTEGER NOT NULL REFERENCES azure_users(id) ON DELETE CASCADE,
  tracking_date       DATE NOT NULL,
  consumed_minutes    NUMERIC(8, 2) DEFAULT 0,
  limit_reached       BOOLEAN DEFAULT FALSE,
  limit_reached_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (azure_user_id, tracking_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_tracking_date
  ON daily_usage_tracking (tracking_date, request_id);
