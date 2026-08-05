-- DP-900: switch from read-only to hands-on write roles (create SQL / Cosmos / Storage).

UPDATE lab_templates
SET
  services = '[
    {
      "name": "Azure SQL Database",
      "roles": ["SQL DB Contributor", "Contributor"],
      "defaultInstance": "Basic",
      "access": "write"
    },
    {
      "name": "Azure Cosmos DB",
      "roles": ["Cosmos DB Operator", "Contributor"],
      "defaultInstance": "Serverless",
      "access": "write"
    },
    {
      "name": "Azure Blob Storage",
      "roles": ["Storage Account Contributor", "Storage Blob Data Contributor"],
      "defaultInstance": "Hot",
      "access": "write"
    }
  ]'::jsonb,
  rbac_actions = '[
    "SQL DB Contributor / Contributor on Microsoft.Sql/servers/databases",
    "Cosmos DB Operator / Contributor on Microsoft.DocumentDB/databaseAccounts",
    "Storage Account Contributor + Storage Blob Data Contributor"
  ]'::jsonb,
  updated_at = now()
WHERE cert_tag = 'DP-900';
