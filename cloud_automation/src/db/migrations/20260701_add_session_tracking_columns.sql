-- Session heartbeat + enforcement metadata for Azure live usage tracking

ALTER TABLE user_usage_sessions
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_reason TEXT,
  ADD COLUMN IF NOT EXISTS sign_in_id TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

ALTER TABLE azure_users
  ADD COLUMN IF NOT EXISTS last_signin_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- Backfill last_seen_at for existing open sessions
UPDATE user_usage_sessions
SET last_seen_at = COALESCE(last_seen_at, login_at)
WHERE logout_at IS NULL
  AND last_seen_at IS NULL;

COMMENT ON COLUMN user_usage_sessions.last_seen_at IS 'Last Azure sign-in heartbeat while session is open';
COMMENT ON COLUMN user_usage_sessions.ended_reason IS 'Why the session ended (e.g. daily_limit_reached, stale_signin)';
COMMENT ON COLUMN user_usage_sessions.sign_in_id IS 'Microsoft Graph sign-in audit log ID';
COMMENT ON COLUMN user_usage_sessions.ip_address IS 'Client IP from Azure sign-in event';
COMMENT ON COLUMN azure_users.last_signin_at IS 'Last detected Azure portal sign-in';
COMMENT ON COLUMN azure_users.blocked_reason IS 'Why access was blocked (e.g. daily_limit_reached)';
