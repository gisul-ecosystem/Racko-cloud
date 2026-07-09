-- Enforce at most one open usage session per user per request.
-- Prevents duplicate overlapping sessions from racing Graph sign-in handlers.

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_session_per_user
  ON user_usage_sessions (request_id, user_id)
  WHERE logout_at IS NULL;

COMMENT ON INDEX idx_one_open_session_per_user IS
  'Ensures only one active (open) usage session per user per request';
