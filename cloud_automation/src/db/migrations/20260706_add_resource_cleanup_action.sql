-- Pause vs delete mode for periodic resource cleanup
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS resource_cleanup_action TEXT NOT NULL DEFAULT 'delete';

ALTER TABLE requests
  DROP CONSTRAINT IF EXISTS requests_resource_cleanup_action_check;

ALTER TABLE requests
  ADD CONSTRAINT requests_resource_cleanup_action_check
  CHECK (resource_cleanup_action IN ('delete', 'pause'));
