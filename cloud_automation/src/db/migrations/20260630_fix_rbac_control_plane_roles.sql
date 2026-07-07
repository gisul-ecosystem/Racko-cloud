-- ============================================================
-- RBAC FIX: Add control-plane roles alongside data-plane defaults
-- Run in Supabase SQL Editor on existing deployments
-- ============================================================

ALTER TABLE public.service_role_mapping
  ADD COLUMN IF NOT EXISTS role_purpose TEXT;

-- ── Update services.default_role to control-plane primary where needed ──
UPDATE public.services SET default_role = 'Storage Account Contributor', azure_role = 'Storage Account Contributor'
WHERE name = 'Azure Blob Storage';

UPDATE public.services SET default_role = 'Storage Account Contributor', azure_role = 'Storage Account Contributor'
WHERE name = 'Azure Data Lake Storage';

UPDATE public.services SET default_role = 'Contributor', azure_role = 'Contributor'
WHERE name = 'Azure Key Vault';

UPDATE public.services SET default_role = 'Contributor', azure_role = 'Contributor'
WHERE name = 'Azure Service Bus';

UPDATE public.services SET default_role = 'Contributor', azure_role = 'Contributor'
WHERE name = 'Azure Machine Learning';

-- ── Storage & Databases ──
INSERT INTO public.service_role_mapping (service_id, azure_role, role_type, scope_type, auto_assign, role_purpose, created_at)
SELECT s.id, r.azure_role, 'builtin', 'resource_group', r.auto_assign, r.role_purpose, NOW()
FROM public.services s
CROSS JOIN (VALUES
  ('Storage Account Contributor', true, 'control_plane'),
  ('Storage Blob Data Contributor', true, 'data_plane')
) AS r(azure_role, auto_assign, role_purpose)
WHERE s.name IN ('Azure Blob Storage', 'Azure Data Lake Storage')
  AND NOT EXISTS (
    SELECT 1 FROM public.service_role_mapping srm
    WHERE srm.service_id = s.id AND srm.azure_role = r.azure_role
  );

UPDATE public.service_role_mapping srm
SET auto_assign = true, role_purpose = 'control_plane'
FROM public.services s
WHERE srm.service_id = s.id
  AND s.name IN ('Azure Blob Storage', 'Azure Data Lake Storage')
  AND srm.azure_role = 'Storage Account Contributor';

UPDATE public.service_role_mapping srm
SET auto_assign = true, role_purpose = 'data_plane'
FROM public.services s
WHERE srm.service_id = s.id
  AND s.name IN ('Azure Blob Storage', 'Azure Data Lake Storage')
  AND srm.azure_role = 'Storage Blob Data Contributor';

-- ── Key Vault ──
INSERT INTO public.service_role_mapping (service_id, azure_role, role_type, scope_type, auto_assign, role_purpose, created_at)
SELECT s.id, 'Contributor', 'builtin', 'resource_group', true, 'control_plane', NOW()
FROM public.services s
WHERE s.name = 'Azure Key Vault'
  AND NOT EXISTS (
    SELECT 1 FROM public.service_role_mapping srm
    WHERE srm.service_id = s.id AND srm.azure_role = 'Contributor'
  );

UPDATE public.service_role_mapping srm
SET auto_assign = true, role_purpose = 'control_plane'
FROM public.services s
WHERE srm.service_id = s.id AND s.name = 'Azure Key Vault' AND srm.azure_role = 'Contributor';

UPDATE public.service_role_mapping srm
SET auto_assign = true, role_purpose = 'data_plane'
FROM public.services s
WHERE srm.service_id = s.id AND s.name = 'Azure Key Vault' AND srm.azure_role = 'Key Vault Secrets Officer';

-- ── Service Bus ──
INSERT INTO public.service_role_mapping (service_id, azure_role, role_type, scope_type, auto_assign, role_purpose, created_at)
SELECT s.id, 'Contributor', 'builtin', 'resource_group', true, 'control_plane', NOW()
FROM public.services s
WHERE s.name = 'Azure Service Bus'
  AND NOT EXISTS (
    SELECT 1 FROM public.service_role_mapping srm
    WHERE srm.service_id = s.id AND srm.azure_role = 'Contributor'
  );

UPDATE public.service_role_mapping srm
SET auto_assign = true, role_purpose = 'control_plane'
FROM public.services s
WHERE srm.service_id = s.id AND s.name = 'Azure Service Bus' AND srm.azure_role = 'Contributor';

UPDATE public.service_role_mapping srm
SET auto_assign = true, role_purpose = 'data_plane'
FROM public.services s
WHERE srm.service_id = s.id AND s.name = 'Azure Service Bus' AND srm.azure_role = 'Azure Service Bus Data Owner';

-- ── Event Grid (verify control plane) ──
UPDATE public.service_role_mapping srm
SET auto_assign = true, role_purpose = 'control_plane'
FROM public.services s
WHERE srm.service_id = s.id AND s.name = 'Azure Event Grid' AND srm.azure_role = 'EventGrid Contributor';

-- ── AI Search ──
UPDATE public.service_role_mapping srm
SET auto_assign = true, role_purpose = 'control_plane'
FROM public.services s
WHERE srm.service_id = s.id AND s.name = 'Azure AI Search' AND srm.azure_role = 'Search Service Contributor';

UPDATE public.service_role_mapping srm
SET auto_assign = false, role_purpose = 'data_plane'
FROM public.services s
WHERE srm.service_id = s.id AND s.name = 'Azure AI Search' AND srm.azure_role = 'Search Index Data Contributor';

INSERT INTO public.service_role_mapping (service_id, azure_role, role_type, scope_type, auto_assign, role_purpose, created_at)
SELECT s.id, 'Search Index Data Contributor', 'builtin', 'resource_group', false, 'data_plane', NOW()
FROM public.services s
WHERE s.name = 'Azure AI Search'
  AND NOT EXISTS (
    SELECT 1 FROM public.service_role_mapping srm
    WHERE srm.service_id = s.id AND srm.azure_role = 'Search Index Data Contributor'
  );

UPDATE public.service_instance_role_mapping sirm
SET azure_role = 'Search Service Contributor'
FROM public.services s
WHERE sirm.service_id = s.id
  AND s.name ILIKE '%AI Search%'
  AND sirm.instance_option = 'Basic';

-- ── Machine Learning ──
INSERT INTO public.service_role_mapping (service_id, azure_role, role_type, scope_type, auto_assign, role_purpose, created_at)
SELECT s.id, 'Contributor', 'builtin', 'resource_group', true, 'control_plane', NOW()
FROM public.services s
WHERE s.name = 'Azure Machine Learning'
  AND NOT EXISTS (
    SELECT 1 FROM public.service_role_mapping srm
    WHERE srm.service_id = s.id AND srm.azure_role = 'Contributor'
  );

UPDATE public.service_role_mapping srm
SET auto_assign = true, role_purpose = 'control_plane'
FROM public.services s
WHERE srm.service_id = s.id AND s.name = 'Azure Machine Learning' AND srm.azure_role = 'Contributor';

UPDATE public.service_role_mapping srm
SET auto_assign = true, role_purpose = 'data_plane'
FROM public.services s
WHERE srm.service_id = s.id AND s.name = 'Azure Machine Learning' AND srm.azure_role = 'AzureML Data Scientist';

-- ── Cosmos DB Serverless tier fix ──
UPDATE public.service_instance_role_mapping sirm
SET azure_role = 'Cosmos DB Operator'
FROM public.services s
WHERE sirm.service_id = s.id
  AND s.name ILIKE '%Cosmos DB%'
  AND sirm.instance_option = 'Serverless';

-- ── Cognitive Services Free tier fix ──
UPDATE public.service_instance_role_mapping sirm
SET azure_role = 'Cognitive Services Contributor'
FROM public.services s
WHERE sirm.service_id = s.id
  AND sirm.instance_option = 'Free'
  AND s.name IN (
    'Azure AI Vision',
    'Azure AI Language',
    'Azure AI Speech',
    'Azure AI Document Intelligence'
  );

-- ── OpenAI Embeddings tier: needs control plane to create resource ──
UPDATE public.service_instance_role_mapping sirm
SET azure_role = 'Cognitive Services OpenAI Contributor'
FROM public.services s
WHERE sirm.service_id = s.id
  AND s.name ILIKE '%OpenAI Service%'
  AND sirm.instance_option = 'Embeddings';

-- Mark remaining default roles with role_purpose where auto_assign is set
UPDATE public.service_role_mapping
SET role_purpose = COALESCE(role_purpose, 'control_plane')
WHERE auto_assign = true AND role_purpose IS NULL;
