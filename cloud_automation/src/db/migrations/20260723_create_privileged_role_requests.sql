-- Privileged Azure RBAC role requests (Contributor, UAA, etc. — not Owner)

CREATE TABLE IF NOT EXISTS privileged_role_requests (
  id BIGSERIAL PRIMARY KEY,
  request_id INTEGER REFERENCES requests(id) ON DELETE SET NULL,
  customer_email TEXT NOT NULL,
  azure_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privileged_role_requests_status
  ON privileged_role_requests (status);

CREATE INDEX IF NOT EXISTS idx_privileged_role_requests_request_id
  ON privileged_role_requests (request_id);

CREATE INDEX IF NOT EXISTS idx_privileged_role_requests_customer_email
  ON privileged_role_requests (customer_email);

COMMENT ON TABLE privileged_role_requests IS 'User-submitted requests for privileged Azure RBAC roles at lab scope';
