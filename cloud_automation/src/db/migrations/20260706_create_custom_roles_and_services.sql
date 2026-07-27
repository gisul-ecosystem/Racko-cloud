-- Custom role definitions (reusable across requests)
CREATE TABLE IF NOT EXISTS custom_role_definitions (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  description     TEXT,
  permissions     JSONB NOT NULL DEFAULT '[]',
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Custom services (reusable across requests)
CREATE TABLE IF NOT EXISTS custom_services (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  description     TEXT,
  category        TEXT DEFAULT 'Custom',
  price_per_user  NUMERIC(10,4) DEFAULT 0,
  icon            TEXT DEFAULT 'custom',
  active          BOOLEAN DEFAULT true,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Custom role assignments per user per request
CREATE TABLE IF NOT EXISTS custom_role_assignments (
  id                     BIGSERIAL PRIMARY KEY,
  request_id             BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  azure_user_id          TEXT NOT NULL,
  username               TEXT NOT NULL,
  custom_role_def_id     BIGINT REFERENCES custom_role_definitions(id),
  custom_role_name       TEXT NOT NULL,
  azure_role_def_id      TEXT,
  permissions            JSONB NOT NULL DEFAULT '[]',
  assigned_by            TEXT,
  assigned_at            TIMESTAMPTZ DEFAULT NOW(),
  revoked_at             TIMESTAMPTZ,
  status                 TEXT DEFAULT 'active'
);

-- Custom services linked to requests
CREATE TABLE IF NOT EXISTS request_custom_services (
  id                BIGSERIAL PRIMARY KEY,
  request_id        BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  custom_service_id BIGINT NOT NULL REFERENCES custom_services(id),
  added_by          TEXT,
  added_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (request_id, custom_service_id)
);

CREATE INDEX IF NOT EXISTS custom_role_assignments_request_idx
  ON custom_role_assignments(request_id);

CREATE INDEX IF NOT EXISTS custom_role_assignments_user_idx
  ON custom_role_assignments(azure_user_id);

CREATE INDEX IF NOT EXISTS request_custom_services_request_idx
  ON request_custom_services(request_id);
