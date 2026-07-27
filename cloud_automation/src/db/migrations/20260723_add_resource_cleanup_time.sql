ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS resource_cleanup_time TEXT,
  ADD COLUMN IF NOT EXISTS resource_cleanup_timezone TEXT;

COMMENT ON COLUMN requests.resource_cleanup_time IS 'Daily cleanup run time in HH:MM (24h), lab timezone';
COMMENT ON COLUMN requests.resource_cleanup_timezone IS 'IANA timezone for resource_cleanup_time';
