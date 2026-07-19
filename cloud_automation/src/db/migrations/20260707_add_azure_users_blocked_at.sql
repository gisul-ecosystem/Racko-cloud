-- Track when an Azure user was blocked (e.g. daily limit reached)

ALTER TABLE azure_users
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

COMMENT ON COLUMN azure_users.blocked_at IS 'When access was blocked (e.g. daily_limit_reached)';
