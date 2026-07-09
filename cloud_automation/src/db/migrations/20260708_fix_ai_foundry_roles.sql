-- Fix AI Foundry roles in existing DB
DO $$
DECLARE
  v_service_id BIGINT;
BEGIN
  SELECT id INTO v_service_id
  FROM public.services
  WHERE name = 'Azure AI Foundry';

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Azure AI Foundry service not found in DB';
  END IF;

  INSERT INTO public.service_role_mapping
    (service_id, azure_role, role_type, scope_type, auto_assign, role_purpose)
  SELECT v_service_id, r.azure_role, r.role_type, r.scope_type, r.auto_assign, r.role_purpose
  FROM (VALUES
    ('Azure AI Developer',            'builtin', 'resource_group', true,  'control_plane'),
    ('Storage Account Contributor',   'builtin', 'resource_group', true,  'control_plane'),
    ('Storage Blob Data Contributor', 'builtin', 'resource_group', true,  'data_plane'),
    ('Key Vault Secrets User',        'builtin', 'resource_group', true,  'data_plane'),
    ('Key Vault Reader',              'builtin', 'resource_group', true,  'control_plane'),
    ('Monitoring Reader',             'builtin', 'resource_group', true,  'control_plane'),
    ('Contributor',                   'builtin', 'resource_group', true,  'control_plane'),
    ('Network Contributor',           'builtin', 'resource_group', true,  'dependency'),
    ('AcrPull',                       'builtin', 'resource_group', true,  'dependency')
  ) AS r(azure_role, role_type, scope_type, auto_assign, role_purpose)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.service_role_mapping srm
    WHERE srm.service_id = v_service_id AND srm.azure_role = r.azure_role
  );

  UPDATE public.service_role_mapping srm
  SET auto_assign  = r.auto_assign,
      role_purpose = r.role_purpose
  FROM (VALUES
    ('Azure AI Developer',            true,  'control_plane'),
    ('Storage Account Contributor',   true,  'control_plane'),
    ('Storage Blob Data Contributor', true,  'data_plane'),
    ('Key Vault Secrets User',        true,  'data_plane'),
    ('Key Vault Reader',              true,  'control_plane'),
    ('Monitoring Reader',             true,  'control_plane'),
    ('Contributor',                   true,  'control_plane'),
    ('Network Contributor',           true,  'dependency'),
    ('AcrPull',                       true,  'dependency')
  ) AS r(azure_role, auto_assign, role_purpose)
  WHERE srm.service_id = v_service_id
    AND srm.azure_role = r.azure_role;

  RAISE NOTICE 'AI Foundry roles updated — service_id: %', v_service_id;
END $$;

-- Sync service_role_dependencies for AI Foundry linked resources
CREATE TABLE IF NOT EXISTS public.service_role_dependencies (
  id              BIGSERIAL PRIMARY KEY,
  service_name    TEXT NOT NULL,
  dependency_role TEXT NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (service_name, dependency_role)
);

INSERT INTO public.service_role_dependencies (service_name, dependency_role, reason)
VALUES
  ('Azure AI Foundry', 'Storage Account Contributor',
   'Required to access AI Foundry linked storage account for datasets and models'),
  ('Azure AI Foundry', 'Storage Blob Data Contributor',
   'Required to read/write datasets, model artifacts and experiment outputs in blob storage'),
  ('Azure AI Foundry', 'Key Vault Secrets User',
   'Required to read secrets from AI Foundry linked Key Vault'),
  ('Azure AI Foundry', 'Key Vault Reader',
   'Required to list and navigate Key Vault resources linked to AI Foundry workspace'),
  ('Azure AI Foundry', 'Monitoring Reader',
   'Required to read Application Insights metrics and logs linked to AI Foundry'),
  ('Azure AI Foundry', 'Contributor',
   'Required to create and manage compute instances and clusters in AI Foundry'),
  ('Azure AI Foundry', 'Network Contributor',
   'Required for AI Foundry compute cluster VNet integration'),
  ('Azure AI Foundry', 'AcrPull',
   'Required to pull base images from Azure Container Registry for AI Foundry environments')
ON CONFLICT (service_name, dependency_role) DO UPDATE SET reason = EXCLUDED.reason;

-- Verify
SELECT azure_role, auto_assign, role_purpose
FROM public.service_role_mapping
WHERE service_id = (SELECT id FROM public.services WHERE name = 'Azure AI Foundry')
ORDER BY auto_assign DESC, role_purpose, azure_role;
