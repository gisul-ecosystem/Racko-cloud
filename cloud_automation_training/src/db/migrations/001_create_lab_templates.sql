CREATE TABLE IF NOT EXISTS lab_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  cert_tag VARCHAR(50) NOT NULL UNIQUE,
  cloud VARCHAR(20) NOT NULL DEFAULT 'azure',
  services JSONB NOT NULL DEFAULT '[]',
  rbac_actions JSONB NOT NULL DEFAULT '[]',
  entra_directory_role VARCHAR(100),
  region VARCHAR(50) NOT NULL,
  duration_hours INTEGER NOT NULL,
  budget_cap_inr NUMERIC(10,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
