-- Microsoft Fabric lab catalog entry for Cloud Labs (DP-600 / DP-700).
-- Assigns Contributor (workspace stand-in) + Storage Blob Data Contributor (OneLake R/W).
-- Idempotent: safe to re-run.

INSERT INTO public.services (
  name, category, azure_role, description, price_per_user, active,
  enable_role_selection, default_role, role_required,
  supports_instances, supports_regions, supports_pricing, supports_usage_limit
)
SELECT
  'Microsoft Fabric',
  'Storage & Databases',
  'Contributor',
  'Microsoft Fabric training labs — capacity, workspace Contributor, and OneLake access.',
  0,
  true,
  false,
  'Contributor',
  true,
  false,
  false,
  false,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.services s WHERE s.name = 'Microsoft Fabric'
);

UPDATE public.services
SET
  supports_instances = false,
  supports_regions = false,
  supports_pricing = false,
  supports_usage_limit = false,
  enable_role_selection = false,
  default_role = COALESCE(default_role, 'Contributor'),
  azure_role = COALESCE(azure_role, 'Contributor'),
  active = true
WHERE name = 'Microsoft Fabric';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'services' AND column_name = 'category_id'
  ) THEN
    UPDATE public.services s
    SET category_id = sc.id
    FROM public.service_categories sc
    WHERE s.category = sc.name
      AND s.name = 'Microsoft Fabric';
  END IF;
END $$;

INSERT INTO public.service_role_mapping (service_id, azure_role, role_type, scope_type, auto_assign, role_purpose, created_at)
SELECT s.id, r.azure_role, 'builtin', r.scope_type, r.auto_assign, r.role_purpose, NOW()
FROM public.services s
JOIN (
  VALUES
    ('Microsoft Fabric', 'Contributor', 'resource_group', true, 'control_plane'),
    ('Microsoft Fabric', 'Storage Blob Data Contributor', 'resource_group', true, 'data_plane'),
    ('Microsoft Fabric', 'Reader', 'resource_group', false, 'control_plane')
) AS r(service_name, azure_role, scope_type, auto_assign, role_purpose)
  ON s.name = r.service_name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_role_mapping srm
  WHERE srm.service_id = s.id
    AND srm.azure_role = r.azure_role
);

INSERT INTO public.service_role_mapping (service_id, azure_role, role_type, scope_type, auto_assign, role_purpose, created_at)
SELECT s.id, 'Storage Blob Data Contributor', 'builtin', 'resource_group', true, 'data_plane', NOW()
FROM public.services s
WHERE s.name = 'Azure Data Lake Storage'
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_role_mapping srm
    WHERE srm.service_id = s.id
      AND srm.azure_role = 'Storage Blob Data Contributor'
  );
