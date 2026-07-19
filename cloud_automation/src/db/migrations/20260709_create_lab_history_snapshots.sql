-- Point-in-time lab history (cleanup snapshots, retained for the life of the request)

CREATE TABLE IF NOT EXISTS lab_history_snapshots (
  id                      SERIAL PRIMARY KEY,
  request_id              INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_id                 INTEGER REFERENCES azure_users(id) ON DELETE SET NULL,
  event_type              TEXT NOT NULL,
  event_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resource_count          INTEGER,
  peak_resource_count     INTEGER,
  total_minutes_lifetime  NUMERIC(10, 2),
  total_minutes_today     NUMERIC(10, 2),
  live_cost_usd           NUMERIC(12, 4),
  azure_cost_mtd_usd      NUMERIC(12, 4),
  resources_deleted       JSONB,
  cleanup_triggered_by    TEXT,
  cleanup_action          TEXT,
  session_id              INTEGER,
  ended_reason            TEXT,
  metadata                JSONB DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_history_snapshots_request
  ON lab_history_snapshots (request_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_lab_history_snapshots_user
  ON lab_history_snapshots (user_id, event_at DESC);
