ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS racko_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_requests_racko_user_id
  ON requests (racko_user_id);

COMMENT ON COLUMN requests.racko_user_id IS 'Racko portal user ID (MongoDB ObjectId) who created the request';
