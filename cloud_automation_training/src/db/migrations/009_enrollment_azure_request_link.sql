ALTER TABLE fabric_enrollments

  ADD COLUMN IF NOT EXISTS learner_email TEXT,

  ADD COLUMN IF NOT EXISTS project_name TEXT,

  ADD COLUMN IF NOT EXISTS account_count INTEGER,

  ADD COLUMN IF NOT EXISTS selected_instances JSONB NOT NULL DEFAULT '[]'::jsonb,

  ADD COLUMN IF NOT EXISTS azure_request_id BIGINT;



ALTER TABLE enrollments

  ADD COLUMN IF NOT EXISTS learner_email TEXT,

  ADD COLUMN IF NOT EXISTS project_name TEXT,

  ADD COLUMN IF NOT EXISTS account_count INTEGER,

  ADD COLUMN IF NOT EXISTS selected_instances JSONB NOT NULL DEFAULT '[]'::jsonb,

  ADD COLUMN IF NOT EXISTS azure_request_id BIGINT;



CREATE INDEX IF NOT EXISTS idx_fabric_enrollments_azure_request

  ON fabric_enrollments (azure_request_id)

  WHERE azure_request_id IS NOT NULL;



CREATE INDEX IF NOT EXISTS idx_enrollments_azure_request

  ON enrollments (azure_request_id)

  WHERE azure_request_id IS NOT NULL;


