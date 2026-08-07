-- Cohort / wave provisioning: finish all steps for a user slice, then next slice.
CREATE TABLE IF NOT EXISTS provision_cohorts (
  id              BIGSERIAL PRIMARY KEY,
  request_id      BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  cohort_index    INTEGER NOT NULL,
  user_number_from INTEGER NOT NULL,
  user_number_to   INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  current_step    TEXT NOT NULL DEFAULT 'resourceGroup'
                    CHECK (current_step IN (
                      'resourceGroup', 'services', 'users', 'roles', 'fabric', 'done'
                    )),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, cohort_index)
);

CREATE INDEX IF NOT EXISTS idx_provision_cohorts_request_status
  ON provision_cohorts (request_id, status, cohort_index);
