-- Seed Azure Data Engineering lab custom services + RBAC role definitions.
-- Covers services missing from the main catalog: ADF, Databricks, Synapse.
-- Idempotent: safe to re-run; upserts by unique name.

INSERT INTO custom_role_definitions (name, description, permissions, created_by)
VALUES
  (
    'Lab - Data Factory Contributor',
    'Azure Data Factory labs — pipelines, linked services, triggers, Key Vault integration.',
    '[
      "Microsoft.DataFactory/factories/*",
      "Microsoft.DataFactory/locations/*",
      "Microsoft.Storage/storageAccounts/read",
      "Microsoft.Storage/storageAccounts/listKeys/action",
      "Microsoft.KeyVault/vaults/read",
      "Microsoft.KeyVault/vaults/secrets/read",
      "Microsoft.Resources/subscriptions/resourceGroups/read",
      "Microsoft.Insights/metrics/read",
      "Microsoft.Insights/logDefinitions/read"
    ]'::jsonb,
    'migration'
  ),
  (
    'Lab - Databricks Workspace User',
    'Azure Databricks labs — workspace, clusters, notebooks, jobs, ADLS Gen2 access.',
    '[
      "Microsoft.Databricks/workspaces/*",
      "Microsoft.Storage/storageAccounts/read",
      "Microsoft.Storage/storageAccounts/blobServices/containers/*",
      "Microsoft.Storage/storageAccounts/blobServices/generateUserDelegationKey/action",
      "Microsoft.ManagedIdentity/userAssignedIdentities/assign/action",
      "Microsoft.Resources/subscriptions/resourceGroups/read",
      "Microsoft.Insights/metrics/read"
    ]'::jsonb,
    'migration'
  ),
  (
    'Lab - Synapse Analytics Contributor',
    'Azure Synapse Analytics labs — SQL/Spark pools, pipelines, notebooks, ADLS integration.',
    '[
      "Microsoft.Synapse/workspaces/*",
      "Microsoft.Synapse/workspaces/sqlPools/*",
      "Microsoft.Synapse/workspaces/bigDataPools/*",
      "Microsoft.Synapse/workspaces/artifacts/*",
      "Microsoft.Synapse/workspaces/notebooks/*",
      "Microsoft.Synapse/workspaces/pipelines/*",
      "Microsoft.Synapse/workspaces/linkedservices/*",
      "Microsoft.Synapse/workspaces/datasets/*",
      "Microsoft.Synapse/workspaces/triggers/*",
      "Microsoft.Sql/servers/databases/*",
      "Microsoft.Storage/storageAccounts/read",
      "Microsoft.Storage/storageAccounts/blobServices/containers/*",
      "Microsoft.KeyVault/vaults/read",
      "Microsoft.KeyVault/vaults/secrets/read",
      "Microsoft.Resources/subscriptions/resourceGroups/read",
      "Microsoft.Insights/metrics/read"
    ]'::jsonb,
    'migration'
  ),
  (
    'Lab - Portal Reader + Cost Viewer',
    'Azure portal navigation and Cost Management basics (Hour 1-2 overview).',
    '[
      "Microsoft.Resources/subscriptions/read",
      "Microsoft.Resources/subscriptions/resourceGroups/read",
      "Microsoft.Resources/subscriptions/resourceGroups/resources/read",
      "Microsoft.Consumption/*/read",
      "Microsoft.CostManagement/*/read",
      "Microsoft.Authorization/*/read"
    ]'::jsonb,
    'migration'
  )
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions,
  updated_at = NOW();

INSERT INTO custom_services (name, description, category, price_per_user, icon, active, created_by)
VALUES
  (
    'Azure Data Factory',
    'Serverless data integration — pipelines, copy activity, mapping data flows. Assign role: Lab - Data Factory Contributor.',
    'Integration & Messaging',
    0.0800,
    'data-factory',
    true,
    'migration'
  ),
  (
    'Azure Databricks',
    'Unified Spark analytics — workspaces, clusters, notebooks, Delta Lake. Assign role: Lab - Databricks Workspace User.',
    'AI & Machine Learning',
    0.1500,
    'databricks',
    true,
    'migration'
  ),
  (
    'Azure Synapse Analytics',
    'Unified analytics — SQL pools, Spark pools, serverless SQL, pipelines. Assign role: Lab - Synapse Analytics Contributor.',
    'Storage & Databases',
    0.1200,
    'synapse',
    true,
    'migration'
  )
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_per_user = EXCLUDED.price_per_user,
  icon = EXCLUDED.icon,
  active = EXCLUDED.active,
  updated_at = NOW();
