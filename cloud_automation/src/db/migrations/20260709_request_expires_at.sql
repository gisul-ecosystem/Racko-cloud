-- Real lab expiry instant (date + end-of-day time in lab timezone).
-- Backfilled from expiry_date + request_usage_windows.window_end_time (fallback 18:00 Asia/Kolkata).

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN requests.expires_at IS
  'Lab access ends at this instant (expiry_date + configured end-of-day time in lab timezone)';

UPDATE requests r
SET expires_at = (
  (
    r.expiry_date::text || ' ' || COALESCE(
      (
        SELECT LEFT(ruw.window_end_time::text, 5)
        FROM request_usage_windows ruw
        WHERE ruw.request_id = r.id
        ORDER BY ruw.day_of_week ASC
        LIMIT 1
      ),
      '18:00'
    )
  )::timestamp AT TIME ZONE COALESCE(
    (
      SELECT ruw.timezone
      FROM request_usage_windows ruw
      WHERE ruw.request_id = r.id
      ORDER BY ruw.day_of_week ASC
      LIMIT 1
    ),
    'Asia/Kolkata'
  )
)
WHERE r.expiry_date IS NOT NULL
  AND r.expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_requests_expires_at
  ON requests (expires_at)
  WHERE expires_at IS NOT NULL;
