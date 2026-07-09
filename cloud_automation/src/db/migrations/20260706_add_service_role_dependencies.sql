-- Service role dependencies
-- When a service is selected, all dependency roles are also assigned automatically
CREATE TABLE IF NOT EXISTS service_role_dependencies (
  id              BIGSERIAL PRIMARY KEY,
  service_name    TEXT NOT NULL,
  dependency_role TEXT NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (service_name, dependency_role)
);

INSERT INTO service_role_dependencies (service_name, dependency_role, reason) VALUES
  ('Azure Virtual Machines (VMs)', 'Network Contributor',
   'Required to create network interface, VNet, subnet, public IP and NSG during VM creation'),

  ('Azure Kubernetes Service (AKS)', 'Network Contributor',
   'Required for AKS node pool networking, load balancer, and ingress controller'),
  ('Azure Kubernetes Service (AKS)', 'Virtual Machine Contributor',
   'Required for AKS node VM management and scaling'),

  ('Azure Application Gateway', 'Network Contributor',
   'Required for App Gateway frontend IP configuration and VNet integration'),

  ('Azure CDN', 'Network Contributor',
   'Required for CDN origin endpoint network configuration'),

  ('Azure Machine Learning', 'Network Contributor',
   'Required for ML compute cluster VNet integration'),
  ('Azure Machine Learning', 'Storage Account Contributor',
   'Required for ML workspace default storage account'),
  ('Azure Machine Learning', 'Storage Blob Data Contributor',
   'Required for ML dataset and model artifact storage'),

  ('Azure AI Foundry', 'Storage Account Contributor',
   'Required for AI Foundry workspace storage'),
  ('Azure AI Foundry', 'Storage Blob Data Contributor',
   'Required for AI Foundry model and data storage'),

  ('Azure ExpressRoute', 'Network Contributor',
   'Required for ExpressRoute circuit VNet peering configuration')

ON CONFLICT (service_name, dependency_role) DO NOTHING;

-- Flag dependency roles in service_role_mapping for auto_assign during request creation
INSERT INTO service_role_mapping
  (service_id, azure_role, role_type, scope_type, auto_assign, role_purpose, created_at)
SELECT s.id, r.azure_role, 'builtin', 'resource_group', true, 'dependency', NOW()
FROM services s
JOIN (
  VALUES
    ('Azure Virtual Machines (VMs)',        'Network Contributor'),
    ('Azure Kubernetes Service (AKS)',       'Network Contributor'),
    ('Azure Kubernetes Service (AKS)',       'Virtual Machine Contributor'),
    ('Azure Application Gateway',           'Network Contributor'),
    ('Azure CDN',                           'Network Contributor'),
    ('Azure Machine Learning',              'Network Contributor'),
    ('Azure Machine Learning',              'Storage Account Contributor'),
    ('Azure Machine Learning',              'Storage Blob Data Contributor'),
    ('Azure AI Foundry',                    'Storage Account Contributor'),
    ('Azure AI Foundry',                    'Storage Blob Data Contributor'),
    ('Azure ExpressRoute',                  'Network Contributor')
) AS r(service_name, azure_role) ON s.name = r.service_name
ON CONFLICT DO NOTHING;

UPDATE service_role_mapping srm
SET auto_assign = true, role_purpose = 'dependency'
FROM services s
JOIN (
  VALUES
    ('Azure Virtual Machines (VMs)',        'Network Contributor'),
    ('Azure Kubernetes Service (AKS)',       'Network Contributor'),
    ('Azure Kubernetes Service (AKS)',       'Virtual Machine Contributor'),
    ('Azure Application Gateway',           'Network Contributor'),
    ('Azure CDN',                           'Network Contributor'),
    ('Azure Machine Learning',              'Network Contributor'),
    ('Azure Machine Learning',              'Storage Account Contributor'),
    ('Azure Machine Learning',              'Storage Blob Data Contributor'),
    ('Azure AI Foundry',                    'Storage Account Contributor'),
    ('Azure AI Foundry',                    'Storage Blob Data Contributor'),
    ('Azure ExpressRoute',                  'Network Contributor')
) AS r(service_name, azure_role) ON s.name = r.service_name
WHERE srm.service_id = s.id AND srm.azure_role = r.azure_role;
