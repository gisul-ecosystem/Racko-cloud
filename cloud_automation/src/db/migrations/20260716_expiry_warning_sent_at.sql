-- One-time 24h expiry warning email flag (no cleanup mails after expiry/delete).
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS expiry_warning_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN requests.expiry_warning_sent_at IS
  'When the 24-hour lab expiry warning email was sent; null means not yet sent.';
