CREATE TABLE IF NOT EXISTS fabric_lab_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  cert_tag VARCHAR(50) NOT NULL UNIQUE,
  provisioner_type VARCHAR(20) NOT NULL DEFAULT 'fabric',
  capacity_sku VARCHAR(10) NOT NULL DEFAULT 'F2',
  capacity_billing_mode VARCHAR(20) NOT NULL DEFAULT 'payg'
    CHECK (capacity_billing_mode IN ('payg','reserved')),
  capacity_hourly_cost_usd NUMERIC(6,2),
  capacity_paused_when_idle BOOLEAN NOT NULL DEFAULT true,
  workspace_items JSONB NOT NULL DEFAULT '[]',
  workspace_role VARCHAR(20) NOT NULL CHECK (workspace_role IN ('Admin','Member','Contributor','Viewer')),
  onelake_permissions VARCHAR(20) DEFAULT 'read-write',
  duration_hours INTEGER NOT NULL,
  budget_cap_usd NUMERIC(10,2) NOT NULL,
  storage_estimate_gb INTEGER DEFAULT 5,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
