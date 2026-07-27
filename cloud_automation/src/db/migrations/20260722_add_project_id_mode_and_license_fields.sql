-- Project metadata, Azure ID mode (test_ids | azure_ids), and Microsoft 365 license selection.

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS project_name TEXT,
  ADD COLUMN IF NOT EXISTS id_mode TEXT,
  ADD COLUMN IF NOT EXISTS microsoft_license_sku_id TEXT,
  ADD COLUMN IF NOT EXISTS microsoft_license_sku_part_number TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'requests_id_mode_check'
  ) THEN
    ALTER TABLE requests
      ADD CONSTRAINT requests_id_mode_check
      CHECK (id_mode IS NULL OR id_mode IN ('test_ids', 'azure_ids'));
  END IF;
END $$;
