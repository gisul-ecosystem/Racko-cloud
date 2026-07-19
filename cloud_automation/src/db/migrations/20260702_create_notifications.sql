CREATE TABLE IF NOT EXISTS notifications (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  request_id    BIGINT REFERENCES requests(id) ON DELETE CASCADE,
  severity      TEXT DEFAULT 'info',
  read          BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications(read);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at DESC);
