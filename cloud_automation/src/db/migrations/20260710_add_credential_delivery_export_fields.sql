ALTER TABLE credential_delivery
  ADD COLUMN IF NOT EXISTS portal_link TEXT,
  ADD COLUMN IF NOT EXISTS admin_username TEXT,
  ADD COLUMN IF NOT EXISTS admin_temporary_password TEXT,
  ADD COLUMN IF NOT EXISTS portal_expires_at TIMESTAMPTZ;
