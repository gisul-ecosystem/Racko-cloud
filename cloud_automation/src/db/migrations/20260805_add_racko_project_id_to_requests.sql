-- Racko org/tenant project ObjectId (distinct from lab project_name).
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_requests_project_id ON requests (project_id);

COMMENT ON COLUMN requests.project_id IS 'Racko Project ObjectId string for cost attribution and UI tags';
