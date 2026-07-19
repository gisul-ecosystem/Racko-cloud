-- Daily usage windows per request (one row per day of week configured)
CREATE TABLE IF NOT EXISTS request_usage_windows (
  id                  SERIAL PRIMARY KEY,
  request_id          INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  day_of_week         SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  window_start_time   TIME NOT NULL,
  window_end_time     TIME NOT NULL,
  timezone            TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(request_id, day_of_week)
);

-- Resource cleanup schedule (separate from expiry/provisioning cleanup)
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS resource_cleanup_enabled        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS resource_cleanup_interval_hours INTEGER,
  ADD COLUMN IF NOT EXISTS resource_cleanup_last_ran_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resource_cleanup_next_run_at    TIMESTAMPTZ;

-- Track resource cleanup runs per request
CREATE TABLE IF NOT EXISTS resource_cleanup_logs (
  id                SERIAL PRIMARY KEY,
  request_id        INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  ran_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resources_deleted JSONB,
  user_count        INTEGER,
  status            TEXT,
  error             TEXT
);

-- Track window enforcement (block/unblock events)
CREATE TABLE IF NOT EXISTS window_enforcement_logs (
  id          SERIAL PRIMARY KEY,
  request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  ran_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_count  INTEGER,
  status      TEXT,
  error       TEXT
);

ALTER TABLE azure_users
  ADD COLUMN IF NOT EXISTS azure_account_enabled BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_requests_resource_cleanup
  ON requests (resource_cleanup_next_run_at)
  WHERE resource_cleanup_enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_request_usage_windows_request_id
  ON request_usage_windows (request_id);
