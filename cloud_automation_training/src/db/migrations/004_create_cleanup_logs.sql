CREATE TABLE IF NOT EXISTS cleanup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('expiry','manual')),
  result TEXT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
