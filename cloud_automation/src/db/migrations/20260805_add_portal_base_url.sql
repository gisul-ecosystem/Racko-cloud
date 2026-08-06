ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS portal_base_url TEXT;

COMMENT ON COLUMN requests.portal_base_url IS
  'Public client-portal origin for emailed manage/purchase links (tenant domain when created from tenant portal).';
