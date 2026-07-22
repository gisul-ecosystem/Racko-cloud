-- Purchase follow-up for Azure test_ids labs (24h Yes/No email + conversion tracking).

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS purchase_intent_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purchase_intent_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purchase_intent_response TEXT,
  ADD COLUMN IF NOT EXISTS purchase_intent_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS purchase_intent_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_from_request_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'requests_purchase_intent_response_check'
  ) THEN
    ALTER TABLE requests
      ADD CONSTRAINT requests_purchase_intent_response_check
      CHECK (
        purchase_intent_response IS NULL
        OR purchase_intent_response IN ('yes', 'no', 'converted')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_requests_purchase_intent_due
  ON requests (purchase_intent_due_at)
  WHERE purchase_intent_sent_at IS NULL
    AND id_mode = 'test_ids';
