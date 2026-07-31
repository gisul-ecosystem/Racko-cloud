-- Persist lab service start date/time (from create-request startDate field).
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;

-- Existing labs: fall back to created_at until explicitly set.
UPDATE requests
SET starts_at = created_at
WHERE starts_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_requests_starts_at ON requests (starts_at);
