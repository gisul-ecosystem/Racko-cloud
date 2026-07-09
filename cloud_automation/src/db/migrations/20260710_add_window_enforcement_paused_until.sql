ALTER TABLE azure_users
  ADD COLUMN IF NOT EXISTS window_enforcement_paused_until TIMESTAMPTZ;

COMMENT ON COLUMN azure_users.window_enforcement_paused_until IS
  'When set and in the future, window/daily schedulers skip blocking this user (admin manual unblock).';
