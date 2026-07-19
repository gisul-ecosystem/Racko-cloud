ALTER TABLE access_portal_sessions
  ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES azure_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_access_portal_sessions_user_id
  ON access_portal_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_access_portal_sessions_admin_id
  ON access_portal_sessions (admin_id);
