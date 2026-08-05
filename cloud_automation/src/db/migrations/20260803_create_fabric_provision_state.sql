-- Track Fabric capacity/workspace provisioning for Cloud Labs (DP-600 / DP-700).
CREATE TABLE IF NOT EXISTS fabric_provision_state (
  request_id BIGINT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  enrollment_id UUID,
  cert_tag TEXT,
  capacity_id TEXT,
  workspace_id TEXT,
  workspace_name TEXT,
  workspace_role TEXT NOT NULL DEFAULT 'Contributor',
  onelake_permissions TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  role_assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'provisioning', 'complete', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fabric_provision_state_status
  ON fabric_provision_state (status);

CREATE TABLE IF NOT EXISTS fabric_workspace_role_assignments (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  azure_user_id TEXT NOT NULL,
  username TEXT,
  workspace_id TEXT NOT NULL,
  workspace_role TEXT NOT NULL,
  assignment_id TEXT,
  status TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'failed', 'skipped')),
  error_message TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, azure_user_id, workspace_id, workspace_role)
);

CREATE INDEX IF NOT EXISTS idx_fabric_workspace_role_assignments_request
  ON fabric_workspace_role_assignments (request_id);
