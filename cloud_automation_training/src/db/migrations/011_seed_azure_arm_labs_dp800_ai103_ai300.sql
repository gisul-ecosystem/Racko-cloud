-- ARM Azure certification labs: DP-800, AI-103, AI-300 (no Fabric license required).
-- Azure RBAC only — same pattern as DP-900 / AI-900 seed.

INSERT INTO lab_templates (
  name,
  cert_tag,
  cloud,
  services,
  rbac_actions,
  entra_directory_role,
  region,
  duration_hours,
  budget_cap_inr,
  active
)
VALUES
(
  'SQL AI Developer Associate',
  'DP-800',
  'azure',
  '[
    {
      "name": "Azure SQL Database",
      "roles": ["SQL DB Contributor", "Contributor"],
      "defaultInstance": "S0",
      "access": "write"
    },
    {
      "name": "Azure AI Foundry",
      "roles": ["Azure AI Developer", "Contributor"],
      "defaultInstance": "Starter",
      "access": "write"
    }
  ]'::jsonb,
  '[
    "SQL DB Contributor / Contributor on Microsoft.Sql/servers",
    "Azure AI Developer + Contributor (Cognitive / Foundry)"
  ]'::jsonb,
  NULL,
  'eastus',
  40,
  7000.00,
  true
),
(
  'Azure AI App and Agent Developer Associate',
  'AI-103',
  'azure',
  '[
    {
      "name": "Azure AI Foundry",
      "roles": ["Azure AI Developer", "Contributor"],
      "defaultInstance": "Starter",
      "access": "write"
    },
    {
      "name": "Azure Machine Learning",
      "roles": ["Contributor", "AzureML Data Scientist"],
      "defaultInstance": "Basic Compute",
      "access": "write"
    },
    {
      "name": "Azure App Service",
      "roles": ["Website Contributor", "Contributor"],
      "defaultInstance": "Basic B1",
      "access": "write",
      "note": "Container Apps not in catalog — App Service covers typical AI-103 app hosts"
    }
  ]'::jsonb,
  '[
    "Azure AI Developer + Contributor (CognitiveServices / Foundry)",
    "Contributor on Microsoft.MachineLearningServices/workspaces",
    "Website Contributor / Contributor on Microsoft.Web/sites",
    "Note: Microsoft.App/containerApps covered via App Service or RG Contributor when needed"
  ]'::jsonb,
  NULL,
  'eastus',
  40,
  8000.00,
  true
),
(
  'MLOps Engineer Associate',
  'AI-300',
  'azure',
  '[
    {
      "name": "Azure Machine Learning",
      "roles": ["Contributor", "AzureML Data Scientist", "AzureML Compute Operator"],
      "defaultInstance": "CPU Cluster",
      "access": "write",
      "note": "Managed AML compute — not raw VMs"
    },
    {
      "name": "Azure Container Registry",
      "roles": ["AcrPush", "AcrPull", "Contributor"],
      "defaultInstance": "Basic",
      "access": "write"
    },
    {
      "name": "Azure Key Vault",
      "roles": ["Key Vault Secrets User", "Contributor"],
      "defaultInstance": "Standard Vault",
      "access": "write"
    }
  ]'::jsonb,
  '[
    "Contributor + AzureML Data Scientist + AzureML Compute Operator on AML workspaces",
    "AcrPush / AcrPull / Contributor on Microsoft.ContainerRegistry/registries",
    "Key Vault Secrets User / Contributor on Microsoft.KeyVault/vaults",
    "Compute is managed AML compute (not raw VMs)"
  ]'::jsonb,
  NULL,
  'eastus',
  40,
  9000.00,
  true
)
ON CONFLICT (cert_tag) DO UPDATE SET
  name = EXCLUDED.name,
  cloud = EXCLUDED.cloud,
  services = EXCLUDED.services,
  rbac_actions = EXCLUDED.rbac_actions,
  region = EXCLUDED.region,
  duration_hours = EXCLUDED.duration_hours,
  budget_cap_inr = EXCLUDED.budget_cap_inr,
  active = true,
  updated_at = now();
