CREATE TABLE IF NOT EXISTS fabric_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES fabric_lab_templates(id),
  status VARCHAR(20) NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning','active','expired','cleaned_up','failed')),
  workspace_id VARCHAR(255),
  capacity_id VARCHAR(255),
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  spend_current NUMERIC(10,2) NOT NULL DEFAULT 0,
  spend_cap_usd NUMERIC(10,2) NOT NULL,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fabric_enrollments_learner_status ON fabric_enrollments(learner_id, status);
CREATE INDEX IF NOT EXISTS idx_fabric_enrollments_expires_at ON fabric_enrollments(expires_at);
