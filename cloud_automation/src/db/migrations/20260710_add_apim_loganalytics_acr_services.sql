-- Add Azure API Management, Log Analytics Workspace, and Azure Container Registry
-- to the service catalog with instance options, RBAC mappings, and tier automation.

INSERT INTO public.services (
  name, category, azure_role, description, price_per_user, active,
  enable_role_selection, default_role, role_required,
  supports_instances, supports_regions, supports_pricing, supports_usage_limit
)
SELECT v.name, v.category, v.azure_role, v.description, v.price_per_user, true,
       true, v.azure_role, false, true, true, true, true
FROM (
  VALUES
    (
      'Azure API Management',
      'Integration & Messaging',
      'API Management Service Contributor',
      'Publish, secure, and manage APIs at scale',
      0.12
    ),
    (
      'Log Analytics Workspace',
      'Monitoring & DevOps',
      'Log Analytics Contributor',
      'Collect, query, and analyze log and telemetry data',
      0.04
    ),
    (
      'Azure Container Registry',
      'Monitoring & DevOps',
      'Contributor',
      'Private Docker container image registry',
      0.05
    )
) AS v(name, category, azure_role, description, price_per_user)
WHERE NOT EXISTS (
  SELECT 1 FROM public.services s WHERE s.name = v.name
);

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
      AND s.name IN (
        'Azure API Management',
        'Log Analytics Workspace',
        'Azure Container Registry'
      );
  END IF;
END $$;

INSERT INTO public.service_role_mapping (service_id, azure_role, role_type, scope_type, auto_assign, role_purpose, created_at)
SELECT s.id, r.azure_role, 'builtin', r.scope_type, r.auto_assign, r.role_purpose, NOW()
FROM public.services s
JOIN (
  VALUES
    ('Azure API Management', 'API Management Service Contributor', 'resource_group', true, 'control_plane'),
    ('Azure API Management', 'API Management Service Reader', 'resource_group', false, 'control_plane'),
    ('Azure API Management', 'API Management Service Operator Role', 'resource_group', false, 'control_plane'),

    ('Log Analytics Workspace', 'Log Analytics Contributor', 'resource_group', true, 'control_plane'),
    ('Log Analytics Workspace', 'Log Analytics Reader', 'resource_group', false, 'control_plane'),
    ('Log Analytics Workspace', 'Monitoring Contributor', 'resource_group', false, 'control_plane'),
    ('Log Analytics Workspace', 'Monitoring Reader', 'resource_group', false, 'control_plane'),

    ('Azure Container Registry', 'Contributor', 'resource_group', true, 'control_plane'),
    ('Azure Container Registry', 'AcrPush', 'resource_group', true, 'data_plane'),
    ('Azure Container Registry', 'AcrPull', 'resource_group', false, 'data_plane')
) AS r(service_name, azure_role, scope_type, auto_assign, role_purpose) ON s.name = r.service_name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_role_mapping srm
  WHERE srm.service_id = s.id
    AND srm.azure_role = r.azure_role
);

INSERT INTO public.service_role_mapping (service_id, azure_role, role_type, scope_type, auto_assign, role_purpose, created_at)
SELECT s.id, 'Network Contributor', 'builtin', 'resource_group', true, 'dependency', NOW()
FROM public.services s
WHERE s.name = 'Azure API Management'
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_role_mapping srm
    WHERE srm.service_id = s.id
      AND srm.azure_role = 'Network Contributor'
  );

UPDATE public.service_role_mapping srm
SET auto_assign = true, role_purpose = 'dependency'
FROM public.services s
WHERE srm.service_id = s.id
  AND s.name = 'Azure API Management'
  AND srm.azure_role = 'Network Contributor';

INSERT INTO public.service_instance_options (service_id, option_name, sort_order)
SELECT s.id, o.option_name, o.sort_order
FROM public.services s
JOIN (
  VALUES
    ('Azure API Management', 'Developer', 1),
    ('Azure API Management', 'Basic', 2),
    ('Azure API Management', 'Standard', 3),
    ('Azure API Management', 'Premium', 4),

    ('Log Analytics Workspace', 'Pay-as-you-go', 1),
    ('Log Analytics Workspace', 'Capacity Reservation', 2),

    ('Azure Container Registry', 'Basic', 1),
    ('Azure Container Registry', 'Standard', 2),
    ('Azure Container Registry', 'Premium', 3)
) AS o(service_name, option_name, sort_order) ON s.name = o.service_name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_instance_options sio
  WHERE sio.service_id = s.id
    AND sio.option_name = o.option_name
);

INSERT INTO public.service_instance_role_mapping (service_id, instance_option, azure_role, tier_automated)
SELECT s.id, m.instance_option, m.azure_role, true
FROM public.services s
JOIN (
  VALUES
    ('Azure API Management', 'Developer', 'API Management Service Contributor'),
    ('Azure API Management', 'Basic', 'API Management Service Contributor'),
    ('Azure API Management', 'Standard', 'API Management Service Contributor'),
    ('Azure API Management', 'Premium', 'API Management Service Contributor'),

    ('Log Analytics Workspace', 'Pay-as-you-go', 'Log Analytics Contributor'),
    ('Log Analytics Workspace', 'Capacity Reservation', 'Log Analytics Contributor'),

    ('Azure Container Registry', 'Basic', 'Contributor'),
    ('Azure Container Registry', 'Standard', 'Contributor'),
    ('Azure Container Registry', 'Premium', 'Contributor')
) AS m(service_name, instance_option, azure_role) ON s.name = m.service_name
ON CONFLICT (service_id, instance_option)
DO UPDATE SET azure_role = EXCLUDED.azure_role, tier_automated = EXCLUDED.tier_automated;

INSERT INTO public.service_locations (
  service_name, service_family, arm_region_name, display_location, location,
  currency, retail_price, unit_of_measure, effective_start_date, pricing_source, created_at
)
SELECT
  s.name,
  s.category,
  r.arm_region_name,
  r.display_location,
  r.location,
  'USD',
  COALESCE(s.price_per_user, 0),
  '1 Hour',
  NOW(),
  'seed',
  NOW()
FROM public.services s
CROSS JOIN (
  VALUES
    ('eastus', 'US East', 'East US'),
    ('westus', 'US West', 'West US'),
    ('centralindia', 'IN Central', 'Central India'),
    ('southeastasia', 'AP Southeast', 'Southeast Asia')
) AS r(arm_region_name, location, display_location)
WHERE s.name IN (
  'Azure API Management',
  'Log Analytics Workspace',
  'Azure Container Registry'
)
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_locations sl
    WHERE sl.service_name = s.name
      AND sl.arm_region_name = r.arm_region_name
  );
