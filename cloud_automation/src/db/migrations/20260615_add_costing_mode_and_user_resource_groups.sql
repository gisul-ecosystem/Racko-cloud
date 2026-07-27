ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS costing_mode TEXT NOT NULL DEFAULT 'shared';

ALTER TABLE azure_users
  ADD COLUMN IF NOT EXISTS user_number INTEGER,
  ADD COLUMN IF NOT EXISTS azure_resource_group_name TEXT,
  ADD COLUMN IF NOT EXISTS azure_resource_group_id TEXT;

CREATE TABLE IF NOT EXISTS request_user_resource_groups (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_number INTEGER NOT NULL,
  azure_resource_group_name TEXT NOT NULL,
  azure_resource_group_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, user_number)
);

CREATE INDEX IF NOT EXISTS idx_request_user_resource_groups_request_id
  ON request_user_resource_groups (request_id);

COMMENT ON COLUMN requests.costing_mode IS 'shared = one resource group for all users; per_user = separate resource group per user';
